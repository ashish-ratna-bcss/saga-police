const callXApi = require('../../blugate/x/blugate.x.api_client');
const { authFromPlatformRow } = callXApi;
const { waitForSlot, noteRateLimit } = require('./rateLimit');

const isRateError = (err) => {
  const status = err?.response?.status;
  const msg = String(err?.message || '').toLowerCase();
  return status === 429 || msg.includes('rate') || msg.includes('too many');
};

const callWithGap = async (endpointKey, params, auth = null) => {
  await waitForSlot();
  try {
    return await callXApi(endpointKey, params, auth);
  } catch (err) {
    if (isRateError(err)) noteRateLimit();
    throw err;
  }
};

const extractUserResult = (res) =>
  res?.result?.data?.user?.result || res?.data?.user?.result || null;

const resolveUserId = async (accountData = {}, auth = null) => {
  const data = accountData && typeof accountData === 'object' ? accountData : {};
  if (data.user_id) {
    return {
      userId: String(data.user_id),
      username: data.username || null,
      displayName: null,
      avatar: null,
      apiHits: 0,
      dataPatch: null,
    };
  }
  const username = String(data.username || '').trim().replace(/^@/, '');
  if (!username) {
    throw new Error('X account needs username or user_id in data');
  }
  const res = await callWithGap('USER', { username }, auth);
  const user = extractUserResult(res);
  const userId = user?.rest_id ? String(user.rest_id) : null;
  if (!userId) {
    throw new Error('USER lookup did not return user_id');
  }
  const screenName = user.core?.screen_name || user.legacy?.screen_name || username;
  return {
    userId,
    username: screenName,
    displayName: user.core?.name || user.legacy?.name || screenName,
    avatar: user.avatar?.image_url || user.legacy?.profile_image_url_https || null,
    apiHits: 1,
    dataPatch: { ...data, username: screenName, user_id: userId },
  };
};

const collectRetweeters = (instructions = []) => {
  const users = [];
  const seen = new Set();

  const pushUser = (user) => {
    if (!user || typeof user !== 'object') return;
    const handle = user.core?.screen_name || user.legacy?.screen_name;
    if (!handle) return;
    const key = String(handle).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    users.push({
      id: user.rest_id ? String(user.rest_id) : null,
      handle: String(handle).replace(/^@/, ''),
      name: user.core?.name || user.legacy?.name || handle,
      avatar: user.avatar?.image_url || user.legacy?.profile_image_url_https || null,
      verified: Boolean(user.is_blue_verified || user.legacy?.verified),
    });
  };

  for (const instruction of instructions) {
    for (const entry of instruction.entries || []) {
      const item = entry.content?.itemContent || entry.itemContent || null;
      pushUser(item?.user_results?.result);
      pushUser(item?.user_result?.result);
      for (const nested of entry.content?.items || []) {
        const nestedItem = nested?.item?.itemContent || nested?.itemContent || nested;
        pushUser(nestedItem?.user_results?.result);
        pushUser(nestedItem?.user_result?.result);
      }
    }
  }
  return users;
};

/**
 * Fetch recent tweets for engager analysis (Blugate USER + USER_TWEETS).
 * Returns tweet rows for live engager analysis (not catalog post rows).
 */
const fetchUserTweetsForEngagerAnalysis = async (
  username,
  { sinceDate = null, maxTweets = 200, auth = null } = {}
) => {
  const clean = String(username || '')
    .trim()
    .replace(/^@/, '');
  if (!clean) throw new Error('username is required');

  const resolved = await resolveUserId({ username: clean }, auth);
  const tweets = [];
  let cursor;
  let pages = 0;
  const maxPages = 15;

  while (tweets.length < maxTweets && pages < maxPages) {
    pages += 1;
    const params = {
      user: resolved.userId,
      count: String(Math.min(40, maxTweets - tweets.length)),
    };
    if (cursor) params.cursor = cursor;

    const response = await callWithGap('USER_TWEETS', params, auth);
    const instructions =
      response?.result?.timeline?.instructions ||
      response?.timeline?.instructions ||
      [];
    const rawTweets = collectRawTweets(instructions);
    if (!rawTweets.length) break;

    let reachedCutoff = false;
    for (const raw of rawTweets) {
      const mapped = mapXPost(raw, null, resolved.username);
      if (!mapped) continue;
      if (sinceDate && mapped.posted_at && mapped.posted_at < sinceDate) {
        reachedCutoff = true;
        continue;
      }
      if (tweets.some((t) => t.id === mapped.external_id)) continue;
      tweets.push({
        id: mapped.external_id,
        text: mapped.text,
        created_at: mapped.posted_at,
        url: mapped.url,
        author: mapped.author_name || resolved.displayName || resolved.username,
        metrics: { retweets: mapped.engagement?.retweets || 0 },
        engagement: mapped.engagement || {},
      });
      if (tweets.length >= maxTweets) break;
    }

    const next = response?.cursor?.bottom;
    if (!next || next === cursor || reachedCutoff) break;
    cursor = next;
  }

  return {
    tweets,
    userData: {
      profileImageUrl: resolved.avatar,
      name: resolved.displayName || resolved.username,
      username: resolved.username,
      userId: resolved.userId,
    },
  };
};

/** List retweeters for one tweet via Blugate RETWEETS. */
const fetchTweetRetweeters = async (tweetId, { count = 100, auth = null } = {}) => {
  const pid = String(tweetId || '').trim();
  if (!pid) return [];
  const response = await callWithGap(
    'RETWEETS',
    {
      pid,
      count: String(Math.max(5, Math.min(Number(count) || 100, 200))),
    },
    auth
  );
  const instructions =
    response?.result?.timeline?.instructions ||
    response?.timeline?.instructions ||
    [];
  return collectRetweeters(instructions);
};

const unwrapTweet = (tweetResult) => {
  if (!tweetResult) return null;
  let tweet = tweetResult;
  for (let i = 0; i < 6; i++) {
    if (!tweet || typeof tweet !== 'object') break;
    if (tweet.result) tweet = tweet.result;
    else if (tweet.tweet) tweet = tweet.tweet;
    else if (tweet.tweetResult) tweet = tweet.tweetResult;
    else if (tweet.tweet_results?.result) tweet = tweet.tweet_results.result;
    else if (tweet.__typename === 'TweetWithVisibilityResults' && tweet.tweet) tweet = tweet.tweet;
    else break;
  }
  if (tweet.__typename === 'TweetUnavailable' || tweet.__typename === 'TweetTombstone') {
    return null;
  }
  return tweet?.legacy ? tweet : null;
};

const extractTweetFromContent = (content) => {
  if (!content) return null;
  return (
    content.itemContent?.tweet_results?.result ||
    content.tweetResult?.result ||
    content.tweet_results?.result ||
    null
  );
};

const collectRawTweets = (instructions = []) => {
  const all = [];
  for (const instruction of instructions) {
    if (instruction.type === 'TimelineAddEntries' || instruction.entries) {
      for (const entry of instruction.entries || []) {
        const entryId = entry.entryId || '';
        if (entryId.startsWith('cursor-') || entry.content?.cursorType) continue;
        if (entryId.startsWith('promoted-') || entryId.startsWith('who-to-follow')) continue;

        const single = extractTweetFromContent(entry.content);
        if (single) {
          all.push(single);
          continue;
        }
        const items = entry.content?.items || entry.items || [];
        for (const item of items) {
          const nested =
            extractTweetFromContent(item?.item?.itemContent ? item.item : null) ||
            extractTweetFromContent(item?.item) ||
            extractTweetFromContent(item);
          if (nested) all.push(nested);
        }
      }
    }
    if (instruction.type === 'TimelinePinEntry' && instruction.entry) {
      const pin = extractTweetFromContent(instruction.entry?.content);
      if (pin) all.push(pin);
    }
    if (instruction.type === 'TimelineAddToModule' && instruction.moduleItems) {
      for (const modItem of instruction.moduleItems) {
        const mod =
          extractTweetFromContent(modItem?.item?.itemContent ? modItem.item : null) ||
          extractTweetFromContent(modItem?.item) ||
          extractTweetFromContent(modItem);
        if (mod) all.push(mod);
      }
    }
  }
  return all;
};

const mapXPost = (raw, accountId, fallbackHandle) => {
  const tweet = unwrapTweet(raw);
  if (!tweet?.legacy) return null;

  const legacy = tweet.legacy;
  const id = String(tweet.rest_id || legacy.id_str || '');
  if (!id) return null;

  const user =
    tweet.core?.user_results?.result ||
    tweet.user_results?.result ||
    null;
  const screenName =
    user?.core?.screen_name ||
    user?.legacy?.screen_name ||
    fallbackHandle ||
    null;
  const authorName = user?.core?.name || user?.legacy?.name || screenName;

  let postedAt = null;
  if (legacy.created_at) {
    const d = new Date(legacy.created_at);
    if (!Number.isNaN(d.getTime())) postedAt = d;
  }

  const media = legacy.extended_entities?.media || legacy.entities?.media || [];
  const mediaUrls = media.map((m) => m.media_url_https || m.media_url).filter(Boolean);

  return {
    account_id: accountId,
    platform: 'x',
    external_id: id,
    url: screenName ? `https://x.com/${screenName}/status/${id}` : null,
    text: legacy.full_text || legacy.text || null,
    author_name: authorName,
    author_handle: screenName ? `@${screenName}` : null,
    media_type: media[0]?.type || 'tweet',
    media_urls: mediaUrls,
    engagement: {
      likes: legacy.favorite_count ?? 0,
      retweets: legacy.retweet_count ?? 0,
      replies: legacy.reply_count ?? 0,
      quotes: legacy.quote_count ?? 0,
      views: tweet.views?.count != null ? Number(tweet.views.count) : null,
    },
    posted_at: postedAt,
    raw_data: tweet,
  };
};

/**
 * Fetch recent tweets for one X catalog account.
 * @param {object} account
 * @param {{ accessKey: string, clientId: string }|null} auth - from platforms table
 */
const fetchXPosts = async (account, auth = null) => {
  const creds = auth || (account.platforms ? authFromPlatformRow(account.platforms) : null);
  const { userId, username, apiHits: resolveHits, dataPatch } = await resolveUserId(
    account.data || {},
    creds
  );
  const response = await callWithGap(
    'USER_TWEETS',
    {
      user: userId,
      count: '20',
    },
    creds
  );
  const instructions =
    response?.result?.timeline?.instructions ||
    response?.timeline?.instructions ||
    [];
  const rawTweets = collectRawTweets(instructions);
  const seen = new Set();
  const posts = [];
  for (const raw of rawTweets) {
    const mapped = mapXPost(raw, account.id, username);
    if (!mapped || seen.has(mapped.external_id)) continue;
    seen.add(mapped.external_id);
    posts.push(mapped);
  }

  return {
    posts,
    apiHits: resolveHits + 1,
    dataPatch,
  };
};

module.exports = {
  fetchXPosts,
  mapXPost,
  resolveUserId,
  fetchUserTweetsForEngagerAnalysis,
  fetchTweetRetweeters,
};
