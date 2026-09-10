const callFacebookApi = require('../../blugate/facebook/blugate.facebook.api_client');
const { waitForSlot, noteRateLimit } = require('./rateLimit');

const isRateError = (err) => {
  const status = err?.response?.status;
  const msg = String(err?.message || '').toLowerCase();
  return status === 429 || msg.includes('rate') || msg.includes('too many');
};

const callWithGap = async (endpointKey, params, auth = null) => {
  await waitForSlot();
  try {
    return await callFacebookApi(endpointKey, params, auth);
  } catch (err) {
    if (isRateError(err)) noteRateLimit();
    throw err;
  }
};

/**
 * Resolve numeric page_id from profile data or PAGE_DETAILS.
 * @returns {{ pageId: string, apiHits: number, dataPatch: object|null }}
 */
const resolvePageId = async (profileData = {}, auth = null) => {
  const data = profileData && typeof profileData === 'object' ? profileData : {};
  if (data.page_id) {
    return { pageId: String(data.page_id), apiHits: 0, dataPatch: null };
  }
  const url = data.url || data.page_url;
  if (!url) {
    throw new Error('Facebook profile needs url or page_id in data');
  }
  const details = await callWithGap('PAGE_DETAILS', { url: String(url) }, auth);
  const pageId =
    details?.results?.page_id ||
    details?.page_id ||
    details?.results?.id ||
    null;
  if (!pageId) {
    throw new Error('PAGE_DETAILS did not return page_id');
  }
  return {
    pageId: String(pageId),
    apiHits: 1,
    dataPatch: { ...data, page_id: String(pageId) },
  };
};

/** Map one Blugate PAGE_POSTS item → shared upsert shape. */
const mapFacebookPost = (post, accountId) => {
  const postedAt =
    post?.timestamp != null && Number.isFinite(Number(post.timestamp))
      ? new Date(Number(post.timestamp) * 1000)
      : null;

  return {
    account_id: accountId,
    platform: 'facebook',
    external_id: String(post.post_id),
    url: post.url || null,
    text: post.message || null,
    author_name: post.author?.name || null,
    author_handle: post.author?.url || null,
    media_type: post.type || 'post',
    media_urls: [],
    engagement: {
      comments: post.comments_count ?? 0,
      reactions: post.reactions_count ?? 0,
      shares: post.reshare_count ?? 0,
      reactions_breakdown: post.reactions || {},
    },
    posted_at: postedAt,
    raw_data: post,
  };
};

/**
 * Fetch one page of posts for an account.
 * @returns {{ posts: object[], apiHits: number, dataPatch: object|null }}
 */
const fetchFacebookPosts = async (account, auth = null) => {
  const { pageId, apiHits: resolveHits, dataPatch } = await resolvePageId(account.data || {}, auth);
  const response = await callWithGap('PAGE_POSTS', { page_id: pageId }, auth);
  const results = Array.isArray(response?.results) ? response.results : [];
  const posts = results
    .filter((p) => p?.post_id)
    .map((p) => mapFacebookPost(p, account.id));

  return {
    posts,
    apiHits: resolveHits + 1,
    dataPatch,
  };
};

module.exports = {
  fetchFacebookPosts,
  mapFacebookPost,
  resolvePageId,
};
