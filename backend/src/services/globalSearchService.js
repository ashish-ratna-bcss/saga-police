const rapidApiXService = require('./rapidApiXService');
const rapidApiFacebookService = require('./rapidApiFacebookService');
const callInstagramApi = require('./blugate/instagram/blugate.instagram.api_client');
const callTelegramApi = require('./blugate/telegram/blugate.telegram.api_client');
const {
  listItems,
  pickUser,
  cleanUsername,
  mapNodesToSearchPosts,
  mapUserToSearchProfile,
} = require('./blugate/instagram/blugate.instagram.helpers');
const {
  listItems: listTelegramItems,
  cleanUsername: cleanTelegramUsername,
} = require('./blugate/telegram/blugate.telegram.helpers');
const youtubeService = require('./youtube.service');
const logger = require('../utils/logger');

/** Blugate IG: username lookup (no keyword search on provider). */
const searchInstagramUsers = async (query, limit = 1) => {
  const username = cleanUsername(query);
  if (!username) return [];
  try {
    const raw = await callInstagramApi('USER_INFO', { username }).catch(() =>
      callInstagramApi('PROFILE', { username })
    );
    const profile = mapUserToSearchProfile(pickUser(raw), username);
    return profile ? [profile].slice(0, Math.max(1, Number(limit) || 1)) : [];
  } catch (_) {
    return [];
  }
};

/** Blugate IG: recent posts for username (provider has no keyword content search). */
const searchInstagramPosts = async (query, limit = 50) => {
  const username = cleanUsername(query);
  if (!username) return [];
  try {
    const raw = await callInstagramApi('POSTS', { username, maxId: '' });
    return mapNodesToSearchPosts(listItems(raw), username, limit);
  } catch (_) {
    return [];
  }
};

/** Telegram: discover channels by keyword (+ username resolve fallback). */
const searchTelegramChannels = async (query, limit = 20) => {
  const q = String(query || '').trim();
  if (!q) return [];
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const out = [];
  try {
    const raw = await callTelegramApi('SEARCH_CHANNELS', { q, limit: safeLimit });
    for (const ch of listTelegramItems(raw)) {
      const handle = cleanTelegramUsername(ch.username || '');
      out.push({
        id: ch.id != null ? String(ch.id) : handle || q,
        name: ch.title || ch.name || handle || q,
        screen_name: handle,
        description: ch.description || '',
        profile_image_url: ch.photo_url || '',
        followers_count: ch.members_count || 0,
        url: ch.url || (handle ? `https://t.me/${handle}` : ''),
        verified: false,
        platform: 'telegram',
      });
    }
  } catch (err) {
    logger.warn(`[GlobalSearch] Telegram SEARCH_CHANNELS: ${err.message}`);
  }
  if (!out.length) {
    const username = cleanTelegramUsername(q);
    if (username) {
      try {
        const ch = await callTelegramApi('CHANNEL_INFO', { username });
        const handle = cleanTelegramUsername(ch.username || username);
        out.push({
          id: ch.id != null ? String(ch.id) : handle,
          name: ch.title || ch.name || handle,
          screen_name: handle,
          description: ch.description || '',
          profile_image_url: ch.photo_url || '',
          followers_count: ch.members_count || 0,
          url: ch.url || `https://t.me/${handle}`,
          verified: false,
          platform: 'telegram',
        });
      } catch (_) {}
    }
  }
  return out.slice(0, safeLimit);
};

/** Telegram: keyword message search. */
const searchTelegramMessages = async (query, limit = 20) => {
  const q = String(query || '').trim();
  if (!q) return [];
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  try {
    const raw = await callTelegramApi('SEARCH_MESSAGES', { q, limit: safeLimit });
    return listTelegramItems(raw)
      .map((m) => {
        const id = m.id ?? m.message_id;
        if (id == null) return null;
        return {
          id: String(id),
          text: m.text || m.message || m.caption || '',
          url: m.url || null,
          created_at: m.date || m.posted_at || m.created_at || null,
          author_name: m.author?.name || m.author_name || m.channel_title || 'Telegram',
          author_handle: m.author?.username || m.author_handle || m.channel_username || '',
          metrics: {
            views: m.views ?? 0,
            shares: m.forwards ?? m.forwards_count ?? 0,
            comments: m.replies_count ?? m.replies ?? 0,
            likes: 0,
          },
          media: Array.isArray(m.media) ? m.media : [],
          platform: 'telegram',
        };
      })
      .filter(Boolean)
      .slice(0, safeLimit);
  } catch (err) {
    logger.warn(`[GlobalSearch] Telegram SEARCH_MESSAGES: ${err.message}`);
    return [];
  }
};

class GlobalSearchService {
    constructor() {
        this.weights = {
            recency: 0.7,
            engagement: 0.2,
            platform: 0.1
        };

        this.platformBoost = {
            'x': 1.2, // Boost X for real-time news
            'youtube': 1.0,
            'facebook': 0.9,
            'instagram': 0.95,
            'telegram': 1.05,
        };
    }

    /**
     * Search Profiles across all platforms
     */
    async searchProfiles(query, limit = 20) {
        const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
        logger.info(`[GlobalSearch] Searching profiles for: ${query}`);
        // X fallback: RapidAPI X -> Official X API -> Scraper
        let xResults = [];
        let xError = null;
        try {
            xResults = await rapidApiXService.searchUsers(query, safeLimit);
        } catch (e) {
            xError = e;
        }
        if ((!xResults || xResults.length === 0) && process.env.X_BEARER_TOKEN) {
            try {
                const xApiService = require('./xApiService');
                // Official API only supports fetch by user, so try as username
                const tweets = await xApiService.fetchUserTweets(query, 1);
                if (tweets && tweets.length > 0) {
                    xResults = [{
                        id: tweets[0].author_id || tweets[0].id,
                        name: tweets[0].author || query,
                        screen_name: tweets[0].author_handle || query,
                        description: '',
                        profile_image_url: tweets[0].author_avatar || '',
                        followers_count: 0,
                        verified: tweets[0].is_verified || false,
                        platform: 'x'
                    }];
                }
            } catch (e) {
                xError = e;
            }
        }
        if ((!xResults || xResults.length === 0) && (!process.env.RAPIDAPI_KEY && !process.env.X_BEARER_TOKEN)) {
            try {
                const { scrapeProfile, getHealthyAccount } = require('./scraperService');
                const account = await getHealthyAccount();
                if (account) {
                    const tweets = await scrapeProfile(query, account);
                    if (tweets && tweets.length > 0) {
                        xResults = [{
                            id: tweets[0].author_id || tweets[0].id,
                            name: tweets[0].author || query,
                            screen_name: tweets[0].author_handle || query,
                            description: '',
                            profile_image_url: tweets[0].author_avatar || '',
                            followers_count: 0,
                            verified: tweets[0].is_verified || false,
                            platform: 'x'
                        }];
                    }
                }
            } catch (e) {
                xError = e;
            }
        }
        const results = await Promise.allSettled([
            Promise.resolve(this.normalizeList(xResults, 'x', 'user')),
            youtubeService.searchChannels(query, safeLimit).then(res => this.normalizeList(res, 'youtube', 'user')),
            rapidApiFacebookService.searchPages(query, { limit: safeLimit }).then(res => this.normalizeList(res, 'facebook', 'user')),
            searchInstagramUsers(query, safeLimit).then(res => this.normalizeList(res, 'instagram', 'user')),
            searchTelegramChannels(query, safeLimit).then(res => this.normalizeList(res, 'telegram', 'user')),
        ]);
        const flatResults = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value);
        return this.rankResults(flatResults, 'user').slice(0, safeLimit);
    }

    /**
     * Search Content across all platforms
     */
    async searchContent(query, limit = 20) {
        const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
        logger.info(`[GlobalSearch] Searching content for: ${query}`);
        // X fallback: RapidAPI X -> Official X API -> Scraper
        let xResults = [];
        let xError = null;
        try {
            xResults = await rapidApiXService.searchTweets(query, safeLimit);
        } catch (e) {
            xError = e;
        }
        if ((!xResults || xResults.length === 0) && process.env.X_BEARER_TOKEN) {
            try {
                const xApiService = require('./xApiService');
                // Official API only supports fetch by user, so try as username
                const tweets = await xApiService.fetchUserTweets(query, safeLimit);
                xResults = tweets || [];
            } catch (e) {
                xError = e;
            }
        }
        if ((!xResults || xResults.length === 0) && (!process.env.RAPIDAPI_KEY && !process.env.X_BEARER_TOKEN)) {
            try {
                const { scrapeProfile, getHealthyAccount } = require('./scraperService');
                const account = await getHealthyAccount();
                if (account) {
                    const tweets = await scrapeProfile(query, account);
                    xResults = tweets || [];
                }
            } catch (e) {
                xError = e;
            }
        }
        const results = await Promise.allSettled([
            Promise.resolve(this.normalizeList(xResults, 'x', 'post')),
            youtubeService.searchVideos(query, safeLimit).then(res => this.normalizeList(res, 'youtube', 'video')),
            rapidApiFacebookService.searchPosts(query, safeLimit).then(res => this.normalizeList(res, 'facebook', 'post')),
            searchInstagramPosts(query, safeLimit).then(res => this.normalizeList(res, 'instagram', 'post')),
            searchTelegramMessages(query, safeLimit).then(res => this.normalizeList(res, 'telegram', 'post')),
        ]);
        const flatResults = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value);
        return this.rankResults(flatResults, 'content').slice(0, safeLimit);
    }

    async searchTelegramProfiles(query, limit = 20) {
        const rows = await searchTelegramChannels(query, limit);
        return this.normalizeList(rows, 'telegram', 'user');
    }

    async searchTelegramContent(query, limit = 20) {
        const rows = await searchTelegramMessages(query, limit);
        return this.normalizeList(rows, 'telegram', 'post');
    }

    /**
     * Normalize a list of items
     */
    normalizeList(items, platform, type) {
        if (!Array.isArray(items)) return [];
        return items.map(item => this.normalizeItem(item, platform, type)).filter(Boolean);
    }

    /**
     * Normalize a single item to the Global Search Schema
     */
    normalizeItem(item, platform, type) {
        try {
            const normalized = {
                id: item.id || item.post_id,
                type: type,
                platform: platform,
                title: item.title || item.name || item.author_name || item.author || '',
                description: item.description || item.text || item.caption || item.about || '',
                url: item.url || item.profile_url || item.post_url || '',

                // Author Info
                author: {
                    name: item.author_name || item.name || item.author || 'Unknown',
                    handle: item.screen_name || item.author_handle || item.author_id || '',
                    avatar: item.profile_image_url || item.author_avatar || item.author_image || item.thumbnails?.default?.url || '',
                    verified: item.verified || item.is_verified || false
                },

                // Media
                media: this.extractMedia(item, platform),
                thumbnail: item.thumbnails?.medium?.url || item.image || item.profile_image_url || '',

                // Engagement
                engagement: {
                    likes: parseInt(item.likes_count || item.metrics?.likes || item.statistics?.likeCount || 0),
                    comments: parseInt(item.metrics?.comments || item.statistics?.commentCount || 0),
                    shares: parseInt(item.metrics?.shares || item.metrics?.retweets || 0),
                    views: parseInt(item.metrics?.views || item.statistics?.viewCount || 0),
                    followers: parseInt(item.followers_count || item.statistics?.subscriberCount || 0)
                },

                // Timestamp
                timestamp: item.created_at || item.publishedAt || item.timestamp || new Date().toISOString()
            };

            // Calculate total engagement score for ranking
            normalized.scoreData = {
                totalEngagement: normalized.engagement.likes +
                    (normalized.engagement.comments * 2) +
                    (normalized.engagement.shares * 3),
                freshness: this.calculateFreshness(normalized.timestamp),
                platformBoost: this.platformBoost[platform] || 1.0
            };

            // Legacy compatibility fields (for frontend transitioning)
            normalized._platform = platform;
            normalized.name = normalized.title;
            normalized.text = normalized.description;
            normalized.profile_image_url = normalized.author.avatar;
            normalized.screen_name = normalized.author.handle;
            normalized.followers_count = normalized.engagement.followers;
            normalized.metrics = normalized.engagement;
            normalized.statistics = {
                likeCount: normalized.engagement.likes,
                viewCount: normalized.engagement.views,
                commentCount: normalized.engagement.comments,
                subscriberCount: normalized.engagement.followers
            };

            return normalized;
        } catch (e) {
            logger.error(`Error normalizing ${platform} item:`, e.message);
            return null;
        }
    }

    extractMedia(item, platform) {
        if (platform === 'youtube') {
            return [{
                type: 'video',
                url: `https://youtube.com/watch?v=${item.id}`,
                preview: item.thumbnails?.medium?.url
            }];
        }

        if (item.media && Array.isArray(item.media)) {
            return item.media.map(m => ({
                type: m.type || 'image',
                url: m.url || m,
                preview: m.preview || m.url || m
            }));
        }

        return [];
    }

    calculateFreshness(dateStr) {
        if (!dateStr) return 0;
        const date = new Date(dateStr);
        const now = new Date();
        const diffHours = (now - date) / (1000 * 60 * 60);

        // Decay function: 1 / (hours + 2)
        // Recent items get high score (0.5 max), older items decay fast
        if (diffHours < 0) return 0.5; // Future/Now
        return 1 / (diffHours + 2);
    }

    rankResults(items, type) {
        if (!items || items.length === 0) return [];

        return items.sort((a, b) => {
            // Rank Profile/Users mainly by followers + platform
            if (type === 'user') {
                const scoreA = (a.engagement.followers * 0.8) + (a.scoreData.platformBoost * 1000);
                const scoreB = (b.engagement.followers * 0.8) + (b.scoreData.platformBoost * 1000);
                return scoreB - scoreA;
            }

            // Content: sort by most recent first, with light engagement tiebreaker
            const timeA = new Date(a.timestamp || 0).getTime();
            const timeB = new Date(b.timestamp || 0).getTime();
            if (timeA !== timeB) return timeB - timeA;
            return (b.scoreData?.totalEngagement || 0) - (a.scoreData?.totalEngagement || 0);
        });
    }
}

module.exports = new GlobalSearchService();
