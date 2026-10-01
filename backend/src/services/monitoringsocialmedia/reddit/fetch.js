const callRedditApi = require('../../blugate/reddit/blugate.reddit.api_client');
const {
  parseRedditTarget,
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
  const target = parseRedditTarget(
    data.profile_kind === 'subreddit' && data.subreddit
      ? `r/${data.subreddit}`
      : data.username || data.handle || account.handle
  );
  if (!target) {
    throw new Error('Reddit account needs a username (u/name) or a subreddit (r/name)');
  }

  const raw = target.kind === 'subreddit'
    ? await callWithGap(
        'RSS_MONITOR',
        {
          subreddits: [target.name],
          sort: 'new',
          time_range: 'all',
          limit: Math.min(25, Math.max(1, Number(data.limit) || 25)),
        },
        auth
      )
    : await callWithGap(
        'RSS_USER',
        {
          username: target.name,
          kind: data.kind || 'overview',
          limit: Math.min(25, Math.max(1, Number(data.limit) || 25)),
        },
        auth
      );

  const items = listPosts(raw);
  const posts = items.map((p) => mapPostToUpsert(p, account.id, target.name)).filter(Boolean);

  const handle = target.kind === 'subreddit' ? `r/${target.name}` : target.name;
  let dataPatch = null;
  if (data.username !== handle || data.profile_kind !== target.kind) {
    dataPatch = {
      ...data,
      username: handle,
      profile_kind: target.kind,
      ...(target.kind === 'subreddit'
        ? { subreddit: target.name }
        : { user_id: target.name }),
    };
  }

  return { posts, apiHits: 1, dataPatch };
};

module.exports = {
  fetchRedditPosts,
};
