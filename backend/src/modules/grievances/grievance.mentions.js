const callXApi = require('../../services/blugate/x/blugate.x.api_client');

/**
 * Grievance Mentions
 * Search for tweets mentioning a specific account via Blugate X API
 */

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

const fetchTweetById = async (tweetId, cache = null, handle = null, auth = null) => {
    const key = String(tweetId || '').trim();
    if (!key) return null;
    if (cache && cache.has(key)) return cache.get(key);

    let snapshot = null;

    try {
        const data = await callXApi('TWEET_DETAILS', { pid: key }, auth);
        const tweetResult =
            data?.result?.tweetResult?.result ||
            data?.result?.tweet ||
            data?.result?.tweet_results?.result ||
            data?.tweet_results?.result ||
            data?.result;
        snapshot = extractTweetSnapshot(tweetResult);
    } catch (e) {
        // fall through to search
    }

    if (!snapshot) {
        const cleanHandle = handle ? String(handle).replace(/^@/, '').trim() : null;
        const searchQueries = [];
        if (cleanHandle) searchQueries.push(`from:${cleanHandle}`);
        searchQueries.push(`url:"/status/${key}"`);

        for (const searchQuery of searchQueries) {
            if (snapshot) break;
            try {
                const data = await callXApi(
                    'SEARCH',
                    {
                        query: searchQuery,
                        type: 'Latest',
                        count: '20',
                    },
                    auth
                );
                const entries = getTimelineEntriesFromSearchResponse(data);
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

const buildReplyThreadChain = async (seedNode, cache = null, maxDepth = 8, auth = null) => {
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
                resolvedNode?.posted_by?.handle || resolvedNode?.in_reply_to_handle || null,
                auth
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

        const fetchedParent = await fetchTweetById(nextId, cache, resolvedNode.in_reply_to_handle || null, auth);
        current = fetchedParent
            ? (normalizeThreadNode({ ...fallback, ...fetchedParent }) || fallback)
            : fallback;

        depth += 1;
    }

    return chain;
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
 * @param {{ accessKey: string, clientId: string }} auth - Blugate credentials from platforms row
 */
const searchMentions = async (handle, limit = 50, startDate = null, endDate = null, auth = null) => {
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

        const responseData = await callXApi(
            'SEARCH',
            {
                query: searchQuery,
                type: 'Latest',
                count: String(adjustedLimit),
            },
            auth
        );
        
        // Log raw response structure for debugging
        if (responseData) {
        }

        // Parse the timeline entries - handle multiple response structures
        const instructions = responseData?.result?.timeline?.instructions || 
                           responseData?.timeline?.instructions ||
                           responseData?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions ||
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
                quoted = await fetchTweetById(legacy.quoted_status_id_str, parentTweetCache, null, auth);
            }

            // Reply context (original post)
            const inReplyToId = legacy.in_reply_to_status_id_str;
            const inReplyToHandle = legacy.in_reply_to_screen_name;

            let inReplyTo = null;
            if (inReplyToId) {
                inReplyTo = await fetchTweetById(inReplyToId, parentTweetCache, inReplyToHandle, auth);
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
                ? await buildReplyThreadChain(inReplyTo, parentTweetCache, 8, auth)
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
        const logger = require('../../lib/logger');
        logger.error(
          `[CatalogGrievances] searchMentions failed for ${handle}: ${error.message}`
        );
        return [];
    }
};

module.exports = {
    searchMentions,
    formatDateForSearch,
};
