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

/**
 * Real image/video CDN url for a PAGE_POSTS item, if any. The API has no
 * `media` array -- same field names already verified working in the event-
 * scan path's normalizeFbMedia() (event.scan.service.js): `video` here is a
 * Facebook PAGE permalink, not a media file, so it's deliberately not used.
 * Video takes priority over the cover image when both exist, same as the
 * Instagram mapper.
 */
const pickFacebookMediaUrl = (post) => {
  const videoUrl = post?.video_files?.video_sd_file || post?.video_files?.video_hd_file || null;
  if (videoUrl) return videoUrl;
  if (post?.image?.uri) return post.image.uri;
  if (Array.isArray(post?.album_preview) && post.album_preview[0]?.image_file_uri) {
    return post.album_preview[0].image_file_uri;
  }
  // Shared/reshared posts often put media on the attached post, not the wrapper.
  const attached = post?.attached_post;
  if (attached?.photo_url) return attached.photo_url;
  if (attached?.video_url) return attached.video_url;
  if (attached?.image?.uri) return attached.image.uri;
  return null;
};

const richText = (value) => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    return value.text || value.message || value.body || null;
  }
  return null;
};

const hasFacebookVideo = (post) =>
  Boolean(
    post?.video_files?.video_sd_file ||
      post?.video_files?.video_hd_file ||
      post?.video_thumbnail ||
      (typeof post?.video === 'string' && /video/i.test(post.video))
  );

const hasFacebookPhoto = (post) =>
  Boolean(
    post?.image?.uri ||
      post?.photo_url ||
      (Array.isArray(post?.album_preview) && post.album_preview.length > 0) ||
      (Number(post?.images_count) > 0)
  );

/**
 * Label for caption-less posts so the UI is not stuck on
 * "[Facebook post without text]" for normal photo/video shares.
 */
const describeFacebookPostFallback = (post) => {
  if (hasFacebookVideo(post) || hasFacebookVideo(post?.attached_post)) return '[Facebook video]';
  if (hasFacebookPhoto(post) || hasFacebookPhoto(post?.attached_post)) return '[Facebook photo]';
  if (post?.attached_post || post?.attached_post_url) return '[Facebook shared post]';
  return '[Facebook post]';
};

/**
 * Caption for a PAGE_POSTS item. Blugate leaves `message` null on many shares /
 * reshare wrappers; the real caption lives on `attached_post.message` (and
 * sometimes only in `message_rich`).
 */
const pickFacebookText = (post) => {
  const candidates = [
    post?.message,
    richText(post?.message_rich),
    post?.description,
    post?.text,
    post?.attached_post?.message,
    richText(post?.attached_post?.message_rich),
    post?.attached_post?.description,
    post?.attached_post?.text,
    post?.author_title,
  ];
  for (const c of candidates) {
    const t = String(c || '').trim();
    if (t) return t;
  }
  return null;
};

/** Caption when present, otherwise a media-aware short label. */
const resolveFacebookText = (post) => pickFacebookText(post) || describeFacebookPostFallback(post);

/** Comment body from POST_COMMENTS — sticker/GIF rows often leave `message` empty. */
const pickFacebookCommentText = (comment) => {
  const candidates = [
    comment?.message,
    comment?.text,
    comment?.body,
    comment?.comment_text,
    typeof comment?.message_rich === 'string' ? comment.message_rich : null,
  ];
  for (const c of candidates) {
    const t = String(c || '').trim();
    if (t) return t;
  }
  return null;
};

/** Map one Blugate PAGE_POSTS item → shared upsert shape. */
const mapFacebookPost = (post, accountId) => {
  const postedAt =
    post?.timestamp != null && Number.isFinite(Number(post.timestamp))
      ? new Date(Number(post.timestamp) * 1000)
      : null;
  const mediaUrl = pickFacebookMediaUrl(post);

  return {
    account_id: accountId,
    platform: 'facebook',
    external_id: String(post.post_id),
    url: post.url || null,
    text: resolveFacebookText(post),
    author_name: post.author?.name || null,
    author_handle: post.author?.url || null,
    media_type: post.type || 'post',
    media_urls: mediaUrl ? [mediaUrl] : [],
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

/**
 * One page of a Page's posts, for walking back through the whole history (Tools → Profile Report).
 * @returns {{ posts: object[], next: string|null, apiHits: number, dataPatch: object|null }}
 */
const fetchFacebookPostsPage = async (account, { cursor = null, auth = null } = {}) => {
  const { pageId, apiHits: resolveHits, dataPatch } = await resolvePageId(account.data || {}, auth);
  const params = { page_id: pageId };
  if (cursor) params.cursor = cursor;
  const response = await callWithGap('PAGE_POSTS', params, auth);
  const results = Array.isArray(response?.results) ? response.results : [];
  const posts = results.filter((p) => p?.post_id).map((p) => mapFacebookPost(p, account.id));
  const raw = response?.cursor;
  const next = raw == null || raw === '' ? null : typeof raw === 'string' ? raw : JSON.stringify(raw);
  return { posts, next: next && next !== cursor ? next : null, apiHits: resolveHits + 1, dataPatch };
};

module.exports = {
  fetchFacebookPosts,
  fetchFacebookPostsPage,
  mapFacebookPost,
  pickFacebookText,
  pickFacebookCommentText,
  pickFacebookMediaUrl,
  describeFacebookPostFallback,
  resolveFacebookText,
  resolvePageId,
};
