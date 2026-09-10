const callInstagramApi = require('../../blugate/instagram/blugate.instagram.api_client');
const {
  listItems,
  mapFeedItemToUpsert,
  cleanUsername,
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

module.exports = {
  fetchInstagramPosts,
  resolveUsername,
};
