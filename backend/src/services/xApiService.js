const { TwitterApi } = require('twitter-api-v2');
const logger = require('../utils/logger');

let appClient = null;

const getClient = () => {
    if (appClient) return appClient;

    const token = process.env.X_BEARER_TOKEN;
    if (!token) {
        throw new Error('X_BEARER_TOKEN is not configured');
    }

    appClient = new TwitterApi(token);
    return appClient;
};

const userIdCache = new Map();

/**
 * Fetch latest tweets for a user handle
 * @param {string} handle - The Twitter/X handle (e.g., "ElonMusk")
 * @param {number} limit - Number of tweets to fetch (default 10)
 */
const fetchUserTweets = async (handle, limit = 10) => {
    try {
        const client = getClient();
        const cleanHandle = handle.replace('@', '');
        logger.info(`[X API] Fetching tweets for ${cleanHandle}...`);

        // 1. Get User ID (Cache Check)
        let userId = userIdCache.get(cleanHandle);

        if (!userId) {
            const user = await client.v2.userByUsername(cleanHandle);
            if (!user.data) {
                logger.info(`[X API] User not found: ${handle}`);
                return [];
            }
            userId = user.data.id;
            userIdCache.set(cleanHandle, userId);
            logger.info(`[X API] Cached User ID for ${cleanHandle}: ${userId}`);
        } else {
            logger.info(`[X API] Using cached User ID for ${cleanHandle}: ${userId}`);
        }

        // 2. Fetch User Timeline
        // Fields to retrieve: explicit fields needed for our Content model
        const tweets = await client.v2.userTimeline(userId, {
            max_results: Math.min(limit, 100), // Max valid is 100
            'tweet.fields': ['created_at', 'public_metrics', 'entities', 'attachments', 'referenced_tweets'],
            'media.fields': ['url', 'preview_image_url', 'type'],
            expansions: ['attachments.media_keys'],
            exclude: ['replies'] // Focus on original content and retweets? Or just 'replies'? Let's keep retweets.
        });

        // 3. Process and Normalize Data
        if (tweets.rateLimit) {
            logger.info(`[X API] Rate Limit: ${tweets.rateLimit.remaining} / ${tweets.rateLimit.limit} (Reset: ${new Date(tweets.rateLimit.reset * 1000).toISOString()})`);
        }

        // Debug: Log structure if data is missing
        if (!tweets.data) {
            logger.info(`[X API] Warning: tweets.data is undefined.`);
        }

        const tweetsData = (tweets.data && Array.isArray(tweets.data)) ? tweets.data : [];
        logger.info(`[X API] Raw tweets found: ${tweetsData.length}`);

        const normalizedTweets = [];

        // Includes helper for media expansion
        const mediaMap = new Map();
        if (tweets.includes && tweets.includes.media) {
            tweets.includes.media.forEach(m => mediaMap.set(m.media_key, m));
        }

        for (const tweet of tweetsData) {
            // Normalize media URL if present
            let mediaUrl = '';
            if (tweet.attachments && tweet.attachments.media_keys) {
                const firstMediaKey = tweet.attachments.media_keys[0];
                const mediaObj = mediaMap.get(firstMediaKey);
                if (mediaObj) {
                    mediaUrl = mediaObj.url || mediaObj.preview_image_url || '';
                }
            }

            // Create normalized object similar to what internal Content model expects
            normalizedTweets.push({
                id: tweet.id,
                text: tweet.text,
                url: `https://x.com/${cleanHandle}/status/${tweet.id}`,
                created_at: tweet.created_at,
                media: mediaUrl,
                metrics: (() => {
                    const { extractXEngagement, xEngagementToMetricsBag } = require('../utils/engagementMetrics');
                    return xEngagementToMetricsBag(extractXEngagement({
                        publicMetrics: tweet.public_metrics
                    }));
                })()
            });
        }

        return normalizedTweets;

    } catch (error) {
        logger.error(`[X API] Error fetching tweets for ${handle}:`, error.message);
        if (error.code) logger.error(`[X API] Code: ${error.code}`);
        if (error.data) logger.error(`[X API] Data: ${JSON.stringify(error.data)}`);

        if (error.code === 429 || error.code === 88) {
            logger.info('[X API] Rate limit hit. Backing off.');
        }
        return [];
    }
};

module.exports = {
    fetchUserTweets
};
