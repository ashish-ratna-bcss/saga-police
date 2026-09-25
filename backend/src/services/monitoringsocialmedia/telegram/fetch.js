const callTelegramApi = require('../../blugate/telegram/blugate.telegram.api_client');
const {
  listItems,
  resolveChannelRef,
  mapMessageToUpsert,
} = require('../../blugate/telegram/blugate.telegram.helpers');
const { waitForSlot, noteRateLimit } = require('./rateLimit');

const isRateError = (err) => {
  const status = err?.response?.status;
  const msg = String(err?.message || '').toLowerCase();
  return status === 429 || msg.includes('rate') || msg.includes('flood') || msg.includes('too many');
};

const callWithGap = async (endpointKey, body, auth = null) => {
  await waitForSlot();
  try {
    return await callTelegramApi(endpointKey, body, auth);
  } catch (err) {
    if (isRateError(err)) noteRateLimit();
    throw err;
  }
};

/**
 * Fetch recent Telegram channel messages (Blugate-style CHANNEL_MESSAGES).
 * @returns {{ posts: object[], apiHits: number, dataPatch: object|null }}
 */
const fetchTelegramPosts = async (account, auth = null) => {
  const data = account?.data && typeof account.data === 'object' ? account.data : {};
  const body = resolveChannelRef({
    ...data,
    username: data.username || data.handle || account.handle,
    url: data.url || data.channel_url,
    channel_id: data.channel_id,
  });

  if (!body.username && !body.url && !body.channel_id) {
    throw new Error('Telegram account needs username, url, or channel_id');
  }

  body.limit = Math.min(50, Math.max(1, Number(body.limit) || 40));

  const raw = await callWithGap('CHANNEL_MESSAGES', body, auth);
  const items = listItems(raw);
  const posts = items.map((m) => mapMessageToUpsert(m, account.id)).filter(Boolean);

  let dataPatch = null;
  const first = items[0];
  const channelId =
    raw?.channel_id ||
    first?.channel_id ||
    body.channel_id ||
    null;
  if (channelId && String(data.channel_id || '') !== String(channelId)) {
    dataPatch = { ...data, channel_id: String(channelId) };
    if (body.username && !data.username) dataPatch.username = body.username;
  }

  return { posts, apiHits: 1, dataPatch };
};

module.exports = {
  fetchTelegramPosts,
};
