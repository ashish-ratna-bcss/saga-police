const axios = require('axios');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Grievance = require('../models/Grievance');
const GrievanceSource = require('../models/GrievanceSource');
const GrievanceSettings = require('../models/GrievanceSettings');
const rapidApiFacebookService = require('./rapidApiFacebookService');
const { archiveTwitterMedia } = require('./contentS3Service');
const { generateComplaintCode } = require('./complaintCodeService');
const { syncLegacyFieldsFromWorkflow } = require('./grievanceWorkflowService');
const logger = require('../utils/logger');

/**
 * Grievance Service
 * Handles fetching mentions from X, processing grievances, and generating reports
 */

const getRapidApiHeaders = () => {
    const apiKey = process.env.RAPIDAPI_KEY;
    const apiHost = process.env.RAPIDAPI_HOST;

    if (!apiKey || !apiHost) {
        throw new Error('RAPIDAPI_KEY or RAPIDAPI_HOST is not configured');
    }

    return {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': apiHost
    };
};

const extractMediaFromLegacy = (legacy) => {
    const media = [];
    const mediaEntities = legacy?.extended_entities?.media || legacy?.entities?.media || [];

    for (const m of mediaEntities) {
        const mediaType = m.type || 'photo';
        let mediaUrl = m.media_url_https || m.url;
        let videoUrl = null;

        // For videos and animated_gifs, extract the actual video URL from video_info
        if ((mediaType === 'video' || mediaType === 'animated_gif') && m.video_info?.variants) {
            const mp4Variants = m.video_info.variants
                .filter(v => v.content_type === 'video/mp4')
                .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

            if (mp4Variants.length > 0) {
                videoUrl = mp4Variants[0].url;
            } else if (m.video_info.variants.length > 0) {
                videoUrl = m.video_info.variants[0].url;
            }
        }

        media.push({
            type: mediaType,
            url: videoUrl || mediaUrl,
            video_url: videoUrl,
            preview_url: m.media_url_https
        });
    }

    return media;
};

const extractTweetSnapshot = (tweetResult) => {
    if (!tweetResult) return null;

    // Handle TweetWithVisibilityResults wrapper
    let result = tweetResult;
    if (result.__typename === 'TweetWithVisibilityResults' && result.tweet) {
        result = result.tweet;
    }
    if (result.__typename === 'TweetUnavailable' || result.__typename === 'TweetTombstone') return null;

    const legacy = result.legacy;
    if (!legacy?.id_str) return null;

    const userResult = result.core?.user_results?.result;
    const userLegacy = userResult?.legacy || {};

    let createdAt = null;
    try {
        if (legacy.created_at) {
            const parsed = new Date(legacy.created_at);
            if (!isNaN(parsed)) createdAt = parsed;
        }
    } catch (e) {
        createdAt = null;
    }

    const handle = userLegacy.screen_name || userResult?.core?.screen_name || 'unknown';
    const tweetUrl = handle && handle !== 'unknown'
        ? `https://x.com/${handle}/status/${legacy.id_str}`
        : `https://x.com/i/web/status/${legacy.id_str}`;

    const noteText = result.note_tweet?.note_tweet_results?.result?.text;
    const text = noteText || legacy.full_text || legacy.text || '';

    return {
        tweet_id: legacy.id_str,
        tweet_url: tweetUrl,
        posted_by: {
            handle,
            display_name: userLegacy.name || userResult?.core?.name || userResult?.legacy?.name || (handle !== 'unknown' ? handle : 'Unknown User'),
            profile_image_url: userLegacy.profile_image_url_https || userResult?.avatar?.image_url,
            is_verified: userResult?.is_blue_verified || userLegacy.verified || false
        },
        content: {
            text,
            full_text: text,
            media: extractMediaFromLegacy(legacy)
        },
        in_reply_to_tweet_id: legacy.in_reply_to_status_id_str || null,
        in_reply_to_handle: legacy.in_reply_to_screen_name || null,
        post_date: createdAt
    };
};

const getTimelineEntriesFromSearchResponse = (data) => {
    const instructions = data?.result?.timeline?.instructions ||
        data?.timeline?.instructions ||
        data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions ||
        [];

    return instructions.find(i => i.type === 'TimelineAddEntries')?.entries ||
        instructions[0]?.entries ||
        [];
};

const fetchTweetById = async (tweetId, cache = null, handle = null) => {
    const key = String(tweetId || '').trim();
    if (!key) return null;
    if (cache && cache.has(key)) return cache.get(key);

    let snapshot = null;

    // Attempt 1: provider-specific tweet endpoint (if available)
    const endpointAttempts = [
        { path: '/tweet', params: { id: key } },
        { path: '/tweet', params: { tweet_id: key } },
        { path: '/tweet-details', params: { id: key } },
        { path: '/tweet-details', params: { tweet_id: key } }
    ];

    for (const attempt of endpointAttempts) {
        try {
            const res = await axios.get(`https://${process.env.RAPIDAPI_HOST}${attempt.path}`, {
                params: attempt.params,
                headers: getRapidApiHeaders(),
                timeout: 5000
            });

            const tweetResult = res.data?.result?.tweet ||
                res.data?.result?.tweet_results?.result ||
                res.data?.tweet_results?.result ||
                res.data?.result;

            snapshot = extractTweetSnapshot(tweetResult);
            if (snapshot) break;
        } catch (e) {
            // continue
        }
    }

    // Attempt 2: search fallback — use from:handle if available, then url operator
    if (!snapshot) {
        const cleanHandle = handle ? String(handle).replace(/^@/, '').trim() : null;
        const searchQueries = [];
        if (cleanHandle) searchQueries.push(`from:${cleanHandle}`);
        searchQueries.push(`url:"/status/${key}"`);

        for (const searchQuery of searchQueries) {
            if (snapshot) break;
            try {
                const res = await axios.get(`https://${process.env.RAPIDAPI_HOST}/search`, {
                    params: { query: searchQuery, type: 'Latest', count: 20 },
                    headers: getRapidApiHeaders(),
                    timeout: 15000
                });

                const entries = getTimelineEntriesFromSearchResponse(res.data);
                for (const entry of entries) {
                    if (entry.entryId?.startsWith('cursor-')) continue;
                    let tweetResult = entry.content?.itemContent?.tweet_results?.result;
                    if (!tweetResult) continue;

                    if (tweetResult.__typename === 'TweetWithVisibilityResults' && tweetResult.tweet) {
                        tweetResult = tweetResult.tweet;
                    }
                    const legacy = tweetResult?.legacy;
                    if (!legacy?.id_str) continue;
                    if (legacy.id_str !== key) continue;

                    snapshot = extractTweetSnapshot(tweetResult);
                    if (snapshot) break;
                }
            } catch (e) {
                // continue to next search query
            }
        }
    }

    if (cache) cache.set(key, snapshot);
    return snapshot;
};

const createFallbackThreadNode = (tweetId, handle = null) => {
    const normalizedId = String(tweetId || '').trim();
    if (!normalizedId) return null;

    const normalizedHandle = String(handle || '').replace(/^@/, '').trim();
    const tweetUrl = normalizedHandle
        ? `https://x.com/${normalizedHandle}/status/${normalizedId}`
        : `https://x.com/i/web/status/${normalizedId}`;

    return {
        tweet_id: normalizedId,
        tweet_url: tweetUrl,
        posted_by: {
            handle: normalizedHandle || undefined
        },
        content: {},
        post_date: null,
        in_reply_to_tweet_id: null,
        in_reply_to_handle: null
    };
};

const hasSnapshotContent = (node) => {
    const text = String(node?.content?.full_text || node?.content?.text || '').trim();
    const mediaCount = Array.isArray(node?.content?.media) ? node.content.media.length : 0;
    return text.length > 0 || mediaCount > 0;
};

const normalizeThreadNode = (node) => {
    if (!node || !node.tweet_id) return null;
    const tweetId = String(node.tweet_id).trim();
    if (!tweetId) return null;

    const handle = String(node?.posted_by?.handle || '').replace(/^@/, '').trim();
    const tweetUrl = node.tweet_url || node.url || (handle
        ? `https://x.com/${handle}/status/${tweetId}`
        : `https://x.com/i/web/status/${tweetId}`);

    return {
        tweet_id: tweetId,
        tweet_url: tweetUrl,
        posted_by: {
            ...(node.posted_by || {}),
            handle: node?.posted_by?.handle || (handle || undefined)
        },
        content: node.content || {},
        post_date: node.post_date || null,
        in_reply_to_tweet_id: node.in_reply_to_tweet_id || null,
        in_reply_to_handle: node.in_reply_to_handle || null
    };
};

const buildReplyThreadChain = async (seedNode, cache = null, maxDepth = 8) => {
    const chain = [];
    const visited = new Set();

    let current = normalizeThreadNode(seedNode);
    let depth = 0;

    while (current && depth < maxDepth) {
        const currentId = String(current.tweet_id || '').trim();
        if (!currentId || visited.has(currentId)) break;
        visited.add(currentId);

        let resolvedNode = current;
        if (!hasSnapshotContent(resolvedNode)) {
            const fetched = await fetchTweetById(
                currentId,
                cache,
                resolvedNode?.posted_by?.handle || resolvedNode?.in_reply_to_handle || null
            );
            if (fetched) {
                resolvedNode = normalizeThreadNode({ ...resolvedNode, ...fetched }) || resolvedNode;
            }
        }

        chain.push({
            tweet_id: resolvedNode.tweet_id,
            tweet_url: resolvedNode.tweet_url,
            posted_by: resolvedNode.posted_by || {},
            content: resolvedNode.content || {},
            post_date: resolvedNode.post_date || null
        });

        const nextId = String(resolvedNode.in_reply_to_tweet_id || '').trim();
        if (!nextId || visited.has(nextId)) break;

        const fallback = createFallbackThreadNode(nextId, resolvedNode.in_reply_to_handle || null);
        if (!fallback) break;

        const fetchedParent = await fetchTweetById(nextId, cache, resolvedNode.in_reply_to_handle || null);
        current = fetchedParent
            ? (normalizeThreadNode({ ...fallback, ...fetchedParent }) || fallback)
            : fallback;

        depth += 1;
    }

    return chain;
};

/**
 * Fetch user profile to get user ID
 */
const fetchUserProfile = async (handle) => {
    try {
        const cleanHandle = handle.replace('@', '').trim();

        const userResponse = await axios.get(`https://${process.env.RAPIDAPI_HOST}/user`, {
            params: { username: cleanHandle },
            headers: getRapidApiHeaders()
        });

        let result = null;
        if (userResponse.data?.result?.data?.user?.result) {
            result = userResponse.data.result.data.user.result;
        } else if (userResponse.data?.data?.user?.result) {
            result = userResponse.data.data.user.result;
        } else if (userResponse.data?.result) {
            result = userResponse.data.result;
        }

        if (!result) return null;

        return {
            id: result.rest_id,
            name: result.legacy?.name,
            screenName: result.legacy?.screen_name,
            isVerified: result.is_blue_verified || result.legacy?.verified || false,
            profileImageUrl: result.avatar?.image_url || result.legacy?.profile_image_url_https
        };
    } catch (error) {
        return null;
    }
};

/**
 * Format date to YYYY-MM-DD for Twitter search query
 */
const formatDateForSearch = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Search for tweets mentioning a specific account using the search endpoint
 * @param {string} handle - Twitter handle to search mentions for
 * @param {number} limit - Maximum number of tweets to fetch
 * @param {string} startDate - Start date for search (YYYY-MM-DD)
 * @param {string} endDate - End date for search (YYYY-MM-DD)
 */
const searchMentions = async (handle, limit = 50, startDate = null, endDate = null) => {
    try {
        const cleanHandle = handle.replace('@', '').trim();
        
        // Build search query with date filters
        let searchQuery = `@${cleanHandle}`;
        
        // Calculate days range to adjust limit
        let daysRange = 1;
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            daysRange = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        }
        
        // Increase limit based on date range (more days = need more tweets)
        const adjustedLimit = Math.min(100, Math.max(limit, daysRange * 20));
        
        // Add date filter using Twitter's since: operator only
        // Twitter search works best with just since: (until: can cause issues)
        if (startDate) {
            const formattedStart = formatDateForSearch(startDate);
            if (formattedStart) {
                searchQuery += ` since:${formattedStart}`;
            }
        }
        


        const response = await axios.get(`https://${process.env.RAPIDAPI_HOST}/search`, {
            params: {
                query: searchQuery,
                type: 'Latest',
                count: adjustedLimit
            },
            headers: getRapidApiHeaders()
        });

        
        // Log raw response structure for debugging
        if (response.data) {
        }

        // Parse the timeline entries - handle multiple response structures
        const instructions = response.data?.result?.timeline?.instructions || 
                           response.data?.timeline?.instructions ||
                           response.data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions ||
                           [];
        
        const timelineEntries = instructions.find(i => i.type === 'TimelineAddEntries')?.entries || 
                               instructions[0]?.entries || 
                               [];


        const tweets = [];
        const processedIds = new Set();
        const parentTweetCache = new Map();

        for (const entry of timelineEntries) {
            // Skip cursor entries
            if (entry.entryId?.startsWith('cursor-')) continue;

            let tweetResult = entry.content?.itemContent?.tweet_results?.result;
            if (!tweetResult) continue;

            // Handle TweetWithVisibilityResults wrapper
            if (tweetResult.__typename === 'TweetWithVisibilityResults' && tweetResult.tweet) {
                tweetResult = tweetResult.tweet;
            }

            // Skip unavailable tweets
            if (tweetResult.__typename === 'TweetUnavailable' || tweetResult.__typename === 'TweetTombstone') {
                continue;
            }

            const legacy = tweetResult.legacy;
            if (!legacy) continue;

            // Skip duplicates
            if (processedIds.has(legacy.id_str)) continue;
            processedIds.add(legacy.id_str);

            // Extract user info
            const userResult = tweetResult.core?.user_results?.result;
            const userLegacy = userResult?.legacy || {};

            // Verify this tweet actually mentions the target account
            const mentions = legacy.entities?.user_mentions || [];
            const isMentioned = mentions.some(m => 
                m.screen_name?.toLowerCase() === cleanHandle.toLowerCase()
            );
            const textContainsMention = legacy.full_text?.toLowerCase().includes(`@${cleanHandle.toLowerCase()}`);

            if (!isMentioned && !textContainsMention) {
                continue;
            }

            let media = extractMediaFromLegacy(legacy);

            // Repost (retweet) context
            let repostedFrom = null;
            let retweetResult = legacy.retweeted_status_result?.result;
            if (retweetResult && retweetResult.__typename === 'TweetWithVisibilityResults' && retweetResult.tweet) {
                retweetResult = retweetResult.tweet;
            }
            if (retweetResult) {
                repostedFrom = extractTweetSnapshot(retweetResult);
                // Retweets often don't have media on the wrapper tweet; pull from original.
                if ((!media || media.length === 0) && repostedFrom?.content?.media?.length) {
                    media = repostedFrom.content.media;
                }
            }

            // Quote tweet context
            let quoted = null;
            let rawQuote = tweetResult?.quoted_status_result?.result || tweetResult?.quoted_status_result;
            if (rawQuote && (rawQuote.result || rawQuote.tweet)) {
                rawQuote = rawQuote.result || rawQuote.tweet;
            }
            if (rawQuote && rawQuote.__typename === 'TweetWithVisibilityResults' && rawQuote.tweet) {
                rawQuote = rawQuote.tweet;
            }
            if (rawQuote) {
                quoted = extractTweetSnapshot(rawQuote);
            } else if (legacy.quoted_status_id_str) {
                quoted = await fetchTweetById(legacy.quoted_status_id_str, parentTweetCache);
            }

            // Reply context (original post)
            const inReplyToId = legacy.in_reply_to_status_id_str;
            const inReplyToHandle = legacy.in_reply_to_screen_name;

            let inReplyTo = null;
            if (inReplyToId) {
                inReplyTo = await fetchTweetById(inReplyToId, parentTweetCache, inReplyToHandle);
                if (!inReplyTo) {
                    const fallbackUrl = inReplyToHandle
                        ? `https://x.com/${inReplyToHandle}/status/${inReplyToId}`
                        : `https://x.com/i/web/status/${inReplyToId}`;
                    inReplyTo = {
                        tweet_id: String(inReplyToId),
                        tweet_url: fallbackUrl,
                        posted_by: { handle: inReplyToHandle || undefined },
                        content: {},
                        post_date: null
                    };
                }
            }

            const threadChain = inReplyTo
                ? await buildReplyThreadChain(inReplyTo, parentTweetCache, 8)
                : [];
            const threadParent = threadChain.length > 0
                ? threadChain[threadChain.length - 1]
                : null;

            // Parse date safely
            let createdAt = new Date();
            try {
                if (legacy.created_at) {
                    const parsed = new Date(legacy.created_at);
                    if (!isNaN(parsed)) {
                        createdAt = parsed;
                    }
                }
            } catch (e) {
            }

            const screenName = userLegacy.screen_name || userResult?.core?.screen_name || 'unknown';
            const tweetUrl = `https://x.com/${screenName}/status/${legacy.id_str}`;

            const context = {
                ...(inReplyTo ? { in_reply_to: inReplyTo } : {}),
                ...(repostedFrom ? { reposted_from: repostedFrom } : {}),
                ...(quoted ? { quoted } : {}),
                ...(threadParent ? { thread_parent: threadParent } : {}),
                ...(threadChain.length > 0 ? { thread_chain: threadChain } : {})
            };

            tweets.push({
                tweet_id: legacy.id_str,
                text: legacy.full_text,
                url: tweetUrl,
                created_at: createdAt,
                author: {
                    handle: screenName,
                    display_name: userLegacy.name || userResult?.core?.name || userResult?.legacy?.name || (screenName !== 'unknown' ? screenName : 'Unknown User'),
                    profile_image_url: userLegacy.profile_image_url_https || userResult?.avatar?.image_url,
                    is_verified: userResult?.is_blue_verified || userLegacy.verified || false,
                    follower_count: userLegacy.followers_count || 0
                },
                media,
                context: Object.keys(context).length > 0 ? context : undefined,
                engagement: {
                    likes: legacy.favorite_count || 0,
                    retweets: legacy.retweet_count || 0,
                    replies: legacy.reply_count || 0,
                    views: parseInt(tweetResult.views?.count || '0', 10),
                    quotes: legacy.quote_count || 0
                }
            });
        }

        return tweets;
    } catch (error) {
        if (error.response) {
        }
        return [];
    }
};

const isWithinDateRange = (dateValue, startDate, endDate) => {
    const d = new Date(dateValue);
    if (isNaN(d)) return false;

    if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (d < start) return false;
    }

    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
    }

    return true;
};

const toSafeDate = (value, fallback = new Date()) => {
    const d = value ? new Date(value) : null;
    return d && !isNaN(d) ? d : fallback;
};

const toSafeHandle = (value, fallback = 'unknown') => {
    const v = String(value || '').trim();
    if (!v) return fallback;
    return v.replace(/\s+/g, '_').replace(/[^\w.-]/g, '').toLowerCase() || fallback;
};

const normalizeFacebookMedia = (mediaArray = []) => {
    if (!Array.isArray(mediaArray)) return [];

    return mediaArray
        .map((item) => {
            if (!item) return null;

            if (typeof item === 'string') {
                const guessedType = /\.(mp4|webm|mov)(\?|$)/i.test(item)
                    || /video[^.]*\.fbcdn\.net/i.test(item)
                    || /\.fbcdn\.net\/v\/t\d+\.\d+-\d+/i.test(item)
                    ? 'video' : 'photo';
                return {
                    type: guessedType,
                    url: item,
                    video_url: guessedType === 'video' ? item : undefined,
                    preview_url: guessedType === 'photo' ? item : undefined
                };
            }

            const url = item.url || item.src || item.video || item.image || item.image_url || item.thumbnail || item.preview;
            if (!url) return null;

            const rawType = String(item.type || item.media_type || '').toLowerCase();
            const isVideo = rawType.includes('video')
                || /\.(mp4|webm|mov)(\?|$)/i.test(url)
                || /video[^.]*\.fbcdn\.net/i.test(url)
                || /\.fbcdn\.net\/v\/t\d+\.\d+-\d+/i.test(url);

            return {
                type: isVideo ? 'video' : 'photo',
                url,
                video_url: isVideo ? (item.video || url) : undefined,
                preview_url: item.preview || item.thumbnail || item.image || (isVideo ? undefined : url)
            };
        })
        .filter(Boolean);
};

const archiveTwitterMediaSafe = async (mediaItems, contentId, archiveMediaFn = archiveTwitterMedia, options = {}) => {
    if (!Array.isArray(mediaItems) || mediaItems.length === 0) {
        return { media: [], failures: 0 };
    }

    try {
        const archived = await archiveMediaFn(mediaItems, contentId, options);
        const failures = archived.filter((item) => (item?.url || item?.video_url) && !item?.s3_url).length;
        return { media: archived, failures };
    } catch (error) {
        logger.error(`[Grievance] Failed to archive media for ${contentId}: ${error.message}`);
        return { media: mediaItems, failures: mediaItems.length };
    }
};

const archiveMentionMediaForStorage = async (mention, archiveMediaFn = archiveTwitterMedia) => {
    const prepared = { ...mention };
    let failures = 0;

    // Pass tweet URL so the Python service (yt-dlp) can download videos from the page
    const tweetUrl = mention.url || (mention.tweet_id ? `https://x.com/i/status/${mention.tweet_id}` : undefined);
    const mainArchive = await archiveTwitterMediaSafe(mention.media, mention.tweet_id, archiveMediaFn, { postUrl: tweetUrl });
    prepared.media = mainArchive.media;
    failures += mainArchive.failures;

    if (mention.context && typeof mention.context === 'object') {
        const contextCopy = { ...mention.context };
        const contextKeys = ['in_reply_to', 'reposted_from', 'quoted', 'thread_parent'];

        for (const key of contextKeys) {
            const contextPost = mention.context[key];
            if (!contextPost?.content || !Array.isArray(contextPost.content.media) || contextPost.content.media.length === 0) continue;

            // Use context post's tweet_url for video downloads
            const contextTweetUrl = contextPost.tweet_url || 
                (contextPost.tweet_id ? `https://x.com/i/status/${contextPost.tweet_id}` : undefined);

            const contextArchive = await archiveTwitterMediaSafe(
                contextPost.content.media,
                `${mention.tweet_id}_${key}_${contextPost.tweet_id || 'unknown'}`,
                archiveMediaFn,
                { postUrl: contextTweetUrl }
            );

            failures += contextArchive.failures;
            contextCopy[key] = {
                ...contextPost,
                content: {
                    ...contextPost.content,
                    media: contextArchive.media
                }
            };
        }

        if (Array.isArray(mention.context.thread_chain) && mention.context.thread_chain.length > 0) {
            const archivedThreadChain = [];
            for (let i = 0; i < mention.context.thread_chain.length; i += 1) {
                const chainPost = mention.context.thread_chain[i];
                if (!chainPost?.content || !Array.isArray(chainPost.content.media) || chainPost.content.media.length === 0) {
                    archivedThreadChain.push(chainPost);
                    continue;
                }

                const chainTweetUrl = chainPost.tweet_url ||
                    (chainPost.tweet_id ? `https://x.com/i/status/${chainPost.tweet_id}` : undefined);

                const chainArchive = await archiveTwitterMediaSafe(
                    chainPost.content.media,
                    `${mention.tweet_id}_thread_chain_${chainPost.tweet_id || i}`,
                    archiveMediaFn,
                    { postUrl: chainTweetUrl }
                );

                failures += chainArchive.failures;
                archivedThreadChain.push({
                    ...chainPost,
                    content: {
                        ...chainPost.content,
                        media: chainArchive.media
                    }
                });
            }

            contextCopy.thread_chain = archivedThreadChain;
        }

        prepared.context = contextCopy;
    }

    prepared.upload_failures = failures;
    return prepared;
};

const upsertXGrievancesForSource = async (source, startDate = null, endDate = null, deps = {}) => {
    const searchMentionsFn = deps.searchMentionsFn || searchMentions;
    const GrievanceModel = deps.GrievanceModel || Grievance;
    const archiveMentionFn = deps.archiveMentionFn || archiveMentionMediaForStorage;
    const archiveMediaFn = deps.archiveMediaFn || archiveTwitterMedia;
    const complaintCodeFn = deps.complaintCodeFn || generateComplaintCode;

    const mentions = await searchMentionsFn(source.handle, 100, startDate, endDate);
    let newCount = 0;

    for (const mention of mentions) {
        const postDate = toSafeDate(mention.created_at);
        if ((startDate || endDate) && !isWithinDateRange(postDate, startDate, endDate)) continue;

        const existing = await GrievanceModel.findOne({ tweet_id: mention.tweet_id });
        if (existing) continue;

        const preparedMention = await archiveMentionFn(mention, archiveMediaFn);
        if (preparedMention.upload_failures > 0) {
            logger.error(`[Grievance] Partial media archive failure for tweet ${mention.tweet_id}: ${preparedMention.upload_failures} item(s)`);
        }

        const grievance = new GrievanceModel({
            complaint_code: await complaintCodeFn(),
            tweet_id: preparedMention.tweet_id,
            tagged_account: source.handle,
            grievance_source_id: source.id,
            platform: 'x',
            posted_by: {
                handle: preparedMention.author.handle,
                display_name: preparedMention.author.display_name,
                profile_image_url: preparedMention.author.profile_image_url,
                is_verified: preparedMention.author.is_verified,
                follower_count: preparedMention.author.follower_count
            },
            content: {
                text: preparedMention.text,
                full_text: preparedMention.text,
                media: preparedMention.media
            },
            context: preparedMention.context,
            tweet_url: preparedMention.url,
            engagement: preparedMention.engagement,
            post_date: postDate,
            detected_date: new Date(),
            workflow_status: 'received',
            workflow_timestamps: {
                received_at: new Date()
            },
            escalation_count: 0
        });

        syncLegacyFieldsFromWorkflow(grievance, 'received');

        await grievance.save();
        newCount += 1;
    }

    return { newCount, totalFetched: mentions.length };
};

const upsertFacebookGrievancesForSource = async (source, startDate = null, endDate = null) => {
    const posts = await rapidApiFacebookService.fetchPagePosts(source.handle, 40, source.display_name);
    let newCount = 0;
    let totalFetched = 0;

    for (const post of posts) {
        const postId = String(post?.id || '').trim();
        if (!postId) continue;

        const postDate = toSafeDate(post.created_at);
        if ((startDate || endDate) && !isWithinDateRange(postDate, startDate, endDate)) continue;

        totalFetched += 1;

        const canonicalPostId = `facebook:post:${postId}`;
        const existingPost = await Grievance.findOne({ tweet_id: canonicalPostId });
        const postUrl = post.url || `https://facebook.com/${postId}`;
        const postMedia = normalizeFacebookMedia(post.media);
        const postAuthorHandle = toSafeHandle(post.author_id || post.author_name);
        const postAuthorName = post.author_name || source.display_name || source.handle;
        const postText = String(post.text || '').trim() || '[Facebook post without text]';

        if (!existingPost) {
            // Archive Facebook media to S3 for permanent availability
            const archivedPostMedia = postMedia.length > 0
                ? (await archiveTwitterMediaSafe(postMedia, canonicalPostId, archiveTwitterMedia, { postUrl })).media
                : [];

            const grievance = new Grievance({
                complaint_code: await generateComplaintCode(),
                tweet_id: canonicalPostId,
                tagged_account: source.handle,
                grievance_source_id: source.id,
                platform: 'facebook',
                posted_by: {
                    handle: postAuthorHandle,
                    display_name: postAuthorName,
                    profile_image_url: '',
                    is_verified: false,
                    follower_count: 0
                },
                content: {
                    text: postText,
                    full_text: postText,
                    media: archivedPostMedia
                },
                tweet_url: postUrl,
                engagement: {
                    likes: post.engagement?.likes || 0,
                    retweets: post.engagement?.shares || 0,
                    replies: post.engagement?.comments || 0,
                    views: post.engagement?.views || 0,
                    quotes: 0
                },
                post_date: postDate,
                detected_date: new Date(),
                workflow_status: 'received',
                workflow_timestamps: {
                    received_at: new Date()
                },
                escalation_count: 0
            });

            syncLegacyFieldsFromWorkflow(grievance, 'received');
            await grievance.save();

            newCount += 1;
        }

        const comments = await rapidApiFacebookService.fetchPostComments(postId, 50);

        for (const comment of comments) {
            const commentId = String(comment?.id || '').trim();
            if (!commentId) continue;

            const commentDate = toSafeDate(comment.created_at, postDate);
            if ((startDate || endDate) && !isWithinDateRange(commentDate, startDate, endDate)) continue;
            const commentText = String(comment.text || '').trim() || '[Facebook comment without text]';

            totalFetched += 1;

            const canonicalCommentId = `facebook:comment:${commentId}`;
            const existingComment = await Grievance.findOne({ tweet_id: canonicalCommentId });
            if (existingComment) continue;

            const commentUrl = postUrl.includes('?')
                ? `${postUrl}&comment_id=${encodeURIComponent(commentId)}`
                : `${postUrl}?comment_id=${encodeURIComponent(commentId)}`;

            // Archive parent post media for comment context (reuse archived if available)
            const archivedContextMedia = postMedia.length > 0
                ? (await archiveTwitterMediaSafe(postMedia, canonicalPostId, archiveTwitterMedia, { postUrl })).media
                : [];

            const grievance = new Grievance({
                complaint_code: await generateComplaintCode(),
                tweet_id: canonicalCommentId,
                tagged_account: source.handle,
                grievance_source_id: source.id,
                platform: 'facebook',
                posted_by: {
                    handle: toSafeHandle(comment.author_id || comment.author_name),
                    display_name: comment.author_name || 'Facebook User',
                    profile_image_url: comment.author_image || '',
                    is_verified: false,
                    follower_count: 0
                },
                content: {
                    text: commentText,
                    full_text: commentText,
                    media: []
                },
                context: {
                    in_reply_to: {
                        tweet_id: canonicalPostId,
                        tweet_url: postUrl,
                        posted_by: {
                            handle: postAuthorHandle,
                            display_name: postAuthorName,
                            profile_image_url: '',
                            is_verified: false
                        },
                        content: {
                            text: postText,
                            full_text: postText,
                            media: archivedContextMedia
                        },
                        post_date: postDate
                    }
                },
                tweet_url: commentUrl,
                engagement: {
                    likes: comment.likes || 0,
                    retweets: 0,
                    replies: comment.replies_count || 0,
                    views: 0,
                    quotes: 0
                },
                post_date: commentDate,
                detected_date: new Date(),
                workflow_status: 'received',
                workflow_timestamps: {
                    received_at: new Date()
                },
                escalation_count: 0
            });

            syncLegacyFieldsFromWorkflow(grievance, 'received');
            await grievance.save();

            newCount += 1;
        }
    }

    return { newCount, totalFetched };
};

const upsertGrievancesForSource = async (source, startDate = null, endDate = null) => {
    const platform = (source.platform || 'x').toLowerCase();
    if (platform === 'facebook') {
        return upsertFacebookGrievancesForSource(source, startDate, endDate);
    }
    return upsertXGrievancesForSource(source, startDate, endDate);
};

/**
 * Fetch and process grievances for all active sources with optional date filter
 */
const fetchAllGrievances = async (startDate = null, endDate = null) => {
    try {
        const sources = await GrievanceSource.find({ is_active: true });
        let totalNew = 0;

        for (const source of sources) {
            const result = await upsertGrievancesForSource(source, startDate, endDate);
            totalNew += result.newCount;

            await GrievanceSource.findOneAndUpdate(
                { id: source.id },
                {
                    $inc: { total_grievances: result.newCount },
                    last_fetched: new Date()
                }
            );
        }

        return { newGrievances: totalNew };
    } catch (error) {
        throw error;
    }
};

/**
 * Fetch grievances for a specific source with optional date filter
 */
const fetchGrievancesForSource = async (sourceId, startDate = null, endDate = null) => {
    try {
        const source = await GrievanceSource.findOne({ id: sourceId });
        if (!source) {
            throw new Error('Source not found');
        }

        const result = await upsertGrievancesForSource(source, startDate, endDate);

        await GrievanceSource.findOneAndUpdate(
            { id: sourceId },
            {
                $inc: { total_grievances: result.newCount },
                last_fetched: new Date()
            }
        );

        return { newGrievances: result.newCount, total: result.totalFetched };
    } catch (error) {
        throw error;
    }
};

/**
 * Generate unique report number
 */
const generateReportNumber = async () => {
    const date = new Date();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);

    // Get count of reports generated today
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const count = await Grievance.countDocuments({
        'complaint.report_number': { $exists: true, $ne: null },
        'complaint.action_taken_at': { $gte: startOfDay, $lte: endOfDay }
    });

    const serial = String(count + 1).padStart(3, '0');
    return `X-GRV-${day}-${month}-${year}-${serial}`;
};

/**
 * Generate PDF report for a grievance
 */
const generatePDFReport = async (grievanceId) => {
    try {
        const grievance = await Grievance.findOne({ id: grievanceId });
        if (!grievance) {
            throw new Error('Grievance not found');
        }

        // Generate report number if not exists
        if (!grievance.complaint.report_number) {
            grievance.complaint.report_number = await generateReportNumber();
            grievance.complaint.action_taken_at = new Date();
            await grievance.save();
        }

        const settings = await GrievanceSettings.findOne({ id: 'grievance_settings' });
        const reportSettings = settings?.report_settings || {};

        // Create PDF
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));

        // Header
        doc.fontSize(18).font('Helvetica-Bold')
           .text(reportSettings.header_text || 'OFFICIAL GRIEVANCE REPORT', { align: 'center' });
        
        doc.moveDown();
        doc.fontSize(12).font('Helvetica')
           .text(`Report Number: ${grievance.complaint.report_number}`, { align: 'center' });
        doc.text(`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, { align: 'center' });

        doc.moveDown(2);

        // Complaint Details Table
        doc.fontSize(14).font('Helvetica-Bold').text('COMPLAINT DETAILS');
        doc.moveDown(0.5);

        // Draw table
        const tableTop = doc.y;
        const tableLeft = 50;
        const colWidth = 250;

        const drawRow = (label, value, y) => {
            doc.font('Helvetica-Bold').fontSize(10).text(label, tableLeft, y, { width: 150 });
            doc.font('Helvetica').fontSize(10).text(value || 'N/A', tableLeft + 160, y, { width: colWidth });
        };

        let currentY = tableTop;
        const rowHeight = 25;

        drawRow('Posted By:', `@${grievance.posted_by.handle}`, currentY);
        currentY += rowHeight;

        drawRow('Post Date & Time:', new Date(grievance.post_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), currentY);
        currentY += rowHeight;

        drawRow('Detected Date & Time:', new Date(grievance.detected_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), currentY);
        currentY += rowHeight;

        drawRow('Tagged Account:', grievance.tagged_account, currentY);
        currentY += rowHeight;

        drawRow('Platform:', 'X (Twitter)', currentY);
        currentY += rowHeight;

        drawRow('Priority:', (grievance.complaint.priority || 'Medium').toUpperCase(), currentY);
        currentY += rowHeight;

        drawRow('Status:', (grievance.complaint.status || 'Pending').replace('_', ' ').toUpperCase(), currentY);
        currentY += rowHeight;

        doc.moveDown(2);

        // Post Content
        doc.fontSize(14).font('Helvetica-Bold').text('POST CONTENT');
        doc.moveDown(0.5);
        
        doc.rect(tableLeft, doc.y, 500, 100).stroke();
        const contentY = doc.y + 10;
        doc.fontSize(10).font('Helvetica').text(grievance.content.text, tableLeft + 10, contentY, { 
            width: 480,
            height: 80
        });

        doc.y = contentY + 90;
        doc.moveDown();

        // Engagement Stats
        if (reportSettings.include_engagement_stats !== false) {
            doc.fontSize(14).font('Helvetica-Bold').text('ENGAGEMENT METRICS');
            doc.moveDown(0.5);
            
            const eng = grievance.engagement || {};
            doc.fontSize(10).font('Helvetica');
            doc.text(`Likes: ${eng.likes || 0}  |  Retweets: ${eng.retweets || 0}  |  Replies: ${eng.replies || 0}  |  Views: ${eng.views || 0}`);
        }

        doc.moveDown(2);

        // Action Details
        if (grievance.complaint.action_taken) {
            doc.fontSize(14).font('Helvetica-Bold').text('ACTION DETAILS');
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica').text(grievance.complaint.action_taken);
        }

        // Footer
        doc.moveDown(2);
        doc.fontSize(8).font('Helvetica')
           .text(reportSettings.footer_text || 'This is a system-generated report.', { align: 'center' });
        
        doc.text(`Tweet URL: ${grievance.tweet_url}`, { align: 'center' });

        doc.end();

        return new Promise((resolve, reject) => {
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(chunks);
                resolve({
                    buffer: pdfBuffer,
                    filename: `${grievance.complaint.report_number}.pdf`,
                    reportNumber: grievance.complaint.report_number
                });
            });
            doc.on('error', reject);
        });
    } catch (error) {
        throw error;
    }
};

/**
 * Get grievance statistics
 */
const getGrievanceStats = async () => {
    try {
        const total = await Grievance.countDocuments({ is_active: true });
        const unclassified = await Grievance.countDocuments({ classification: 'unclassified', is_active: true });
        const acknowledged = await Grievance.countDocuments({ classification: 'acknowledged', is_active: true });
        const complaints = await Grievance.countDocuments({ classification: 'complaint', is_active: true });

        const pending = await Grievance.countDocuments({ 
            classification: 'complaint', 
            'complaint.status': 'pending',
            is_active: true 
        });
        const sent = await Grievance.countDocuments({ 
            classification: 'complaint', 
            'complaint.status': 'sent',
            is_active: true 
        });
        const reviewed = await Grievance.countDocuments({ 
            classification: 'complaint', 
            'complaint.status': 'reviewed',
            is_active: true 
        });
        const caseBooked = await Grievance.countDocuments({ 
            classification: 'complaint', 
            'complaint.status': 'case_booked',
            is_active: true 
        });
        const workflowPending = await Grievance.countDocuments({
            is_active: true,
            workflow_status: { $in: ['received', 'reviewed', 'action_taken'] }
        });
        const workflowClosed = await Grievance.countDocuments({
            is_active: true,
            workflow_status: 'closed'
        });
        const workflowFir = await Grievance.countDocuments({
            is_active: true,
            workflow_status: 'converted_to_fir'
        });

        const sources = await GrievanceSource.countDocuments({ is_active: true });

        return {
            total,
            total_complaints: total,
            unclassified,
            acknowledged,
            complaints,
            pending: workflowPending,
            closed: workflowClosed,
            converted_to_fir: workflowFir,
            byStatus: {
                pending,
                sent,
                reviewed,
                case_booked: caseBooked
            },
            activeSources: sources
        };
    } catch (error) {
        throw error;
    }
};

module.exports = {
    fetchUserProfile,
    searchMentions,
    fetchAllGrievances,
    fetchGrievancesForSource,
    generateReportNumber,
    generatePDFReport,
    getGrievanceStats,
    fetchTweetById,
    extractTweetSnapshot,
    buildReplyThreadChain,
    __private: {
        archiveMentionMediaForStorage,
        upsertXGrievancesForSource
    }
};
