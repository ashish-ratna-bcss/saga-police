const prisma = require('../../../prisma/client');
const {
  fetchTweetRetweeters,
  fetchUserTweetsForEngagerAnalysis,
} = require('../../services/monitoringsocialmedia/x/fetch');
const logger = require('../../lib/logger');

const normalizeHandle = (value) =>
  String(value || '')
    .replace(/^@/, '')
    .trim()
    .toLowerCase();

const asEngagement = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
};

const pickAvatar = (previewData) => {
  const preview = previewData && typeof previewData === 'object' ? previewData : {};
  const summary = preview.summary && typeof preview.summary === 'object' ? preview.summary : {};
  return (
    summary.image ||
    preview.image ||
    preview.profile_image_url ||
    summary.profile_image_url ||
    null
  );
};

/**
 * List X catalog accounts that have posts (no Mongo / no engager storage).
 */
const listCatalogXAccounts = async () => {
  const accounts = await prisma.social_media_accounts.findMany({
    where: {
      is_active: true,
      platforms: { slug: 'x' },
    },
    include: {
      profile: { select: { display_name: true } },
      platforms: { select: { slug: true } },
      _count: { select: { posts: true } },
    },
    orderBy: { updated_at: 'desc' },
  });

  return accounts
    .filter((a) => (a._count?.posts || 0) > 0)
    .map((a) => {
      const handle = normalizeHandle(a.handle);
      return {
        handle,
        handle_lower: handle,
        display_name: a.profile?.display_name || a.handle,
        avatar: pickAvatar(a.preview_data),
        tweets_analyzed: a._count.posts,
        unique_retweeters: 0,
        engagers: [],
        status: 'ready',
        period_days: 30,
        live: true,
      };
    });
};

const loadCatalogTweets = async (cleanHandle, sinceDate, maxTweets = 200) => {
  const posts = await prisma.social_media_posts.findMany({
    where: {
      platform: 'x',
      posted_at: { gte: sinceDate },
      OR: [
        { author_handle: { equals: `@${cleanHandle}`, mode: 'insensitive' } },
        { author_handle: { equals: cleanHandle, mode: 'insensitive' } },
        { account: { handle: { equals: cleanHandle, mode: 'insensitive' } } },
      ],
    },
    include: {
      account: {
        include: { profile: { select: { display_name: true } } },
      },
    },
    orderBy: { posted_at: 'desc' },
    take: maxTweets,
  });

  if (!posts.length) return null;

  const first = posts[0];
  return {
    tweets: posts.map((p) => {
      const eng = asEngagement(p.engagement);
      return {
        id: String(p.external_id),
        text: p.text,
        created_at: p.posted_at,
        url: p.url || `https://x.com/${cleanHandle}/status/${p.external_id}`,
        author: p.author_name || first.account?.profile?.display_name || cleanHandle,
        metrics: { retweets: Number(eng.retweets) || 0 },
        engagement: eng,
      };
    }),
    userData: {
      profileImageUrl: pickAvatar(first.account?.preview_data),
      name: first.account?.profile?.display_name || first.author_name || cleanHandle,
      username: cleanHandle,
    },
    source: 'catalog',
  };
};

/**
 * Live engager analysis for one handle.
 * Tweets from Postgres catalog posts (Blugate USER_TWEETS fallback).
 * Retweeters from Blugate RETWEETS — nothing persisted.
 */
const analyzeHandleLive = async (handle, { periodDays = 30 } = {}) => {
  const cleanHandle = normalizeHandle(handle);
  if (!cleanHandle) {
    const err = new Error('handle is required');
    err.status = 400;
    throw err;
  }

  const safePeriod = Math.max(1, Math.min(Number(periodDays) || 30, 90));
  const cutoff = new Date(Date.now() - safePeriod * 24 * 60 * 60 * 1000);

  logger.info(`[AlertsEngagers] Live analysis @${cleanHandle} (${safePeriod}d)`);

  let pack = await loadCatalogTweets(cleanHandle, cutoff, 200);
  if (!pack?.tweets?.length) {
    logger.info(`[AlertsEngagers] No catalog posts — Blugate fallback @${cleanHandle}`);
    pack = await fetchUserTweetsForEngagerAnalysis(cleanHandle, {
      sinceDate: cutoff,
      maxTweets: 80,
    });
    if (pack) pack.source = 'blugate';
  }

  const tweets = Array.isArray(pack?.tweets) ? pack.tweets : [];
  if (!tweets.length) {
    return {
      handle: cleanHandle,
      handle_lower: cleanHandle,
      display_name: pack?.userData?.name || cleanHandle,
      avatar: pack?.userData?.profileImageUrl || null,
      analyzed_at: new Date().toISOString(),
      period_days: safePeriod,
      status: 'completed',
      tweets_analyzed: 0,
      unique_retweeters: 0,
      total_retweet_events: 0,
      summary: { super_active: 0, regular: 0, occasional: 0, one_time: 0 },
      engagers: [],
      tweets: [],
      live: true,
      source: pack?.source || 'none',
    };
  }

  const MAX_TWEETS_FOR_RETWEETERS = 12;
  const sorted = [...tweets].sort((a, b) => {
    const rtA = Number(a?.metrics?.retweets || a?.engagement?.retweets || 0);
    const rtB = Number(b?.metrics?.retweets || b?.engagement?.retweets || 0);
    return rtB - rtA;
  });

  const engagerMap = new Map();
  const tweetSnapshots = [];
  let totalRetweetEvents = 0;
  let retweeterFetchCount = 0;

  for (const tweet of tweets) {
    const tweetId = String(tweet?.id || '').trim();
    if (!tweetId) continue;

    const retweetCount = Number(
      tweet?.metrics?.retweets || tweet?.engagement?.retweets || 0
    );
    const snapshot = {
      tweet_id: tweetId,
      text: String(tweet?.text || '').substring(0, 280),
      created_at: tweet?.created_at ? new Date(tweet.created_at) : null,
      content_url: tweet?.url || `https://x.com/${cleanHandle}/status/${tweetId}`,
      retweet_count: retweetCount,
      retweeters_found: 0,
    };

    const isTop =
      sorted.indexOf(tweet) < MAX_TWEETS_FOR_RETWEETERS &&
      retweetCount > 0 &&
      retweeterFetchCount < MAX_TWEETS_FOR_RETWEETERS;

    if (isTop) {
      retweeterFetchCount += 1;
      try {
        const retweeters = await fetchTweetRetweeters(tweetId, { count: 100 });
        snapshot.retweeters_found = retweeters.length;
        totalRetweetEvents += retweeters.length;

        for (const rt of retweeters) {
          const rtHandle = normalizeHandle(rt?.handle);
          if (!rtHandle) continue;
          if (!engagerMap.has(rtHandle)) {
            engagerMap.set(rtHandle, {
              handle: rtHandle,
              name: rt.name || rtHandle,
              avatar: rt.avatar || null,
              verified: !!rt.verified,
              user_id: rt.id || null,
              tweet_ids: new Set(),
            });
          }
          const entry = engagerMap.get(rtHandle);
          entry.tweet_ids.add(tweetId);
          if (rt.name) entry.name = rt.name;
          if (rt.avatar) entry.avatar = rt.avatar;
          if (rt.verified) entry.verified = true;
          if (rt.id) entry.user_id = rt.id;
        }
      } catch (err) {
        logger.error(
          `[AlertsEngagers] retweeters failed for ${tweetId}: ${err.message}`
        );
      }
    }

    tweetSnapshots.push(snapshot);
  }

  const totalTweetsAnalyzed = tweetSnapshots.length;
  const summaryCount = {
    super_active: 0,
    regular: 0,
    occasional: 0,
    one_time: 0,
  };
  const engagers = [];

  for (const [, entry] of engagerMap) {
    const tweetsRetweeted = entry.tweet_ids.size;
    const ratio = totalTweetsAnalyzed > 0 ? tweetsRetweeted / totalTweetsAnalyzed : 0;
    let frequency = 'one-time';
    if (ratio >= 0.5 || tweetsRetweeted >= 10) frequency = 'super-active';
    else if (ratio >= 0.25 || tweetsRetweeted >= 5) frequency = 'regular';
    else if (tweetsRetweeted >= 2) frequency = 'occasional';

    const key =
      frequency === 'super-active'
        ? 'super_active'
        : frequency === 'one-time'
          ? 'one_time'
          : frequency;
    summaryCount[key] = (summaryCount[key] || 0) + 1;

    engagers.push({
      handle: entry.handle,
      name: entry.name,
      avatar: entry.avatar,
      verified: entry.verified,
      user_id: entry.user_id,
      tweets_retweeted: tweetsRetweeted,
      tweet_ids: [...entry.tweet_ids],
      frequency,
    });
  }

  engagers.sort((a, b) => {
    const order = { 'super-active': 0, regular: 1, occasional: 2, 'one-time': 3 };
    const d = (order[a.frequency] ?? 9) - (order[b.frequency] ?? 9);
    if (d !== 0) return d;
    return b.tweets_retweeted - a.tweets_retweeted;
  });

  return {
    handle: cleanHandle,
    handle_lower: cleanHandle,
    display_name: pack?.userData?.name || tweets[0]?.author || cleanHandle,
    avatar: pack?.userData?.profileImageUrl || null,
    analyzed_at: new Date().toISOString(),
    period_days: safePeriod,
    status: 'completed',
    tweets_analyzed: totalTweetsAnalyzed,
    unique_retweeters: engagers.length,
    total_retweet_events: totalRetweetEvents,
    summary: summaryCount,
    engagers,
    tweets: tweetSnapshots,
    live: true,
    source: pack?.source || 'catalog',
  };
};

module.exports = {
  listCatalogXAccounts,
  analyzeHandleLive,
  normalizeHandle,
};
