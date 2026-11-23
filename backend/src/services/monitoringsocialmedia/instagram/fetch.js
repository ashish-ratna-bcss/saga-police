const callInstagramApi = require('../../blugate/instagram/blugate.instagram.api_client');
const {
  listItems,
  mapFeedItemToUpsert,
  cleanUsername,
  nextCursorOf,
} = require('../../blugate/instagram/blugate.instagram.helpers');
const { waitForSlot, noteRateLimit } = require('./rateLimit');

const isRateError = (err) => {
  const status = err?.response?.status;
  const msg = String(err?.message || '').toLowerCase();
  return err?.isRateLimit || status === 429 || msg.includes('rate') || msg.includes('too many');
};

const callWithGap = async (endpointKey, body, auth = null) => {
  await waitForSlot();
  try {
    return await callInstagramApi(endpointKey, body, auth);
  } catch (err) {
    if (isRateError(err)) noteRateLimit();
    throw err;
  }
};

const resolveUsername = (account) => {
  const data = account?.data && typeof account.data === 'object' ? account.data : {};
  return cleanUsername(account.handle || data.username || data.handle || '');
};

/**
 * Fetch posts + reels for an Instagram account (Blugate IG client — same pattern as facebook/youtube).
 * @returns {{ posts: object[], apiHits: number, dataPatch: object|null }}
 */
const fetchInstagramPosts = async (account, auth = null) => {
  const username = resolveUsername(account);
  if (!username) {
    throw new Error('Instagram account needs a username/handle');
  }

  let apiHits = 0;
  const mapped = [];

  const postsRaw = await callWithGap('POSTS', { username, maxId: '' }, auth);
  apiHits += 1;
  for (const node of listItems(postsRaw)) {
    const row = mapFeedItemToUpsert(node, account.id, 'post');
    if (row) mapped.push(row);
  }

  try {
    const reelsRaw = await callWithGap('REELS', { username, maxId: '' }, auth);
    apiHits += 1;
    for (const node of listItems(reelsRaw)) {
      const row = mapFeedItemToUpsert(node, account.id, 'reel');
      if (row) mapped.push(row);
    }
  } catch (err) {
    console.warn(`[instagram/fetch] reels failed for ${username}: ${err.message}`);
  }

  const byId = new Map();
  for (const row of mapped) {
    const prev = byId.get(row.external_id);
    if (!prev || row.media_type === 'reel') byId.set(row.external_id, row);
  }

  const data = account.data && typeof account.data === 'object' ? account.data : {};
  const dataPatch = data.username === username ? null : { ...data, username };

  return {
    posts: [...byId.values()],
    apiHits,
    dataPatch,
  };
};

/**
 * One page of an account's history, for walking back through all of it (Tools → Profile Report).
 * Instagram has two feeds, posts then reels, each with its own cursor, so the cursor here is
 * { feed: 'posts'|'reels', maxId } and the page after the last posts page is the first reels page.
 * @returns {{ posts: object[], next: {feed: string, maxId: string}|null, apiHits: number, dataPatch: object|null }}
 */
const fetchInstagramPostsPage = async (account, { cursor = null, auth = null } = {}) => {
  const username = resolveUsername(account);
  if (!username) throw new Error('Instagram account needs a username/handle');

  const feed = cursor?.feed === 'reels' ? 'reels' : 'posts';
  const maxId = cursor?.maxId || '';
  let raw;
  try {
    raw = await callWithGap(feed === 'reels' ? 'REELS' : 'POSTS', { username, maxId }, auth);
  } catch (err) {
    // Plenty of accounts have no reels feed; that must not fail an account whose posts were all collected.
    if (feed === 'reels' && !isRateError(err)) {
      console.warn(`[instagram/fetch] reels page skipped for ${username}: ${err.message}`);
      return { posts: [], next: null, apiHits: 1, dataPatch: null };
    }
    throw err;
  }
  const kind = feed === 'reels' ? 'reel' : 'post';
  const posts = listItems(raw).map((node) => mapFeedItemToUpsert(node, account.id, kind)).filter(Boolean);

  const more = nextCursorOf(raw);
  let next = null;
  if (more && more !== maxId && posts.length) next = { feed, maxId: more };
  else if (feed === 'posts') next = { feed: 'reels', maxId: '' };

  const data = account.data && typeof account.data === 'object' ? account.data : {};
  return { posts, next, apiHits: 1, dataPatch: data.username === username ? null : { ...data, username } };
};

module.exports = {
  fetchInstagramPosts,
  fetchInstagramPostsPage,
  resolveUsername,
};
