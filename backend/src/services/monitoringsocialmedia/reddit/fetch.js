const callRedditApi = require('../../blugate/reddit/blugate.reddit.api_client');
const {
  cleanUsername,
  listPosts,
  mapPostToUpsert,
} = require('../../blugate/reddit/blugate.reddit.helpers');
const callWithGap = async (endpointKey, body, auth = null) => callRedditApi(endpointKey, body, auth);

/**
 * Fetch recent activity for a Reddit user (BluGate RSS_USER).
 * @returns {{ posts: object[], apiHits: number, dataPatch: object|null }}
 */
const fetchRedditPosts = async (account, auth = null) => {
  const data = account?.data && typeof account.data === 'object' ? account.data : {};
  const username = cleanUsername(data.username || data.handle || account.handle);
  if (!username) {
    throw new Error('Reddit account needs a username');
  }

  const raw = await callWithGap(
    'RSS_USER',
    {
      username,
      kind: data.kind || 'overview',
      limit: Math.min(25, Math.max(1, Number(data.limit) || 25)),
    },
    auth
  );

  const items = listPosts(raw);
  const posts = items.map((p) => mapPostToUpsert(p, account.id, username)).filter(Boolean);

  let dataPatch = null;
  if (!data.username || data.username !== username) {
    dataPatch = { ...data, username, user_id: username };
  }

  return { posts, apiHits: 1, dataPatch };
};

module.exports = {
  fetchRedditPosts,
};
