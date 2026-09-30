/**
 * Telegram provider endpoints for Blurasaga (Blugate-style).
 * Provider returns data only — Blurasaga owns Start/Stop, schedule, and storage.
 * Host via TELEGRAM_BASE_URL (see blugate.telegram.env.js).
 */
const TELEGRAM_ENDPOINTS = {
  HEALTH: {
    method: 'GET',
    path: '/health',
    usedFor: 'Liveness — System Health',
    params: [],
  },
  READY: {
    method: 'GET',
    path: '/ready',
    usedFor: 'Readiness — System Health',
    params: [],
  },
  STATUS: {
    method: 'GET',
    path: '/api/telegram/status',
    usedFor: 'Telegram session connected / authorized — System Health',
    params: [],
  },
  CHANNEL_INFO: {
    method: 'POST',
    path: '/api/telegram/channel',
    usedFor: 'Resolve channel/group/bot metadata — Social Profiles preview',
    params: [
      { name: 'username', in: 'body', required: false, type: 'string' },
      { name: 'url', in: 'body', required: false, type: 'string' },
      { name: 'channel_id', in: 'body', required: false, type: 'string' },
    ],
  },
  CHANNEL_MESSAGES: {
    method: 'POST',
    path: '/api/telegram/channel/messages',
    usedFor: 'Recent messages for monitoring poll',
    params: [
      { name: 'username', in: 'body', required: false, type: 'string' },
      { name: 'channel_id', in: 'body', required: false, type: 'string' },
      { name: 'limit', in: 'body', required: false, type: 'number' },
      { name: 'cursor', in: 'body', required: false, type: 'string' },
    ],
  },
  MESSAGE: {
    method: 'POST',
    path: '/api/telegram/message',
    usedFor: 'Single message by URL or ids — Alerts investigate',
    params: [
      { name: 'url', in: 'body', required: false, type: 'string' },
      { name: 'channel_id', in: 'body', required: false, type: 'string' },
      { name: 'message_id', in: 'body', required: false, type: 'string' },
    ],
  },
  MESSAGE_REPLIES: {
    method: 'POST',
    path: '/api/telegram/message/replies',
    usedFor: 'Replies under a message — Grievances',
    params: [
      { name: 'channel_id', in: 'body', required: true, type: 'string' },
      { name: 'message_id', in: 'body', required: true, type: 'string' },
      { name: 'limit', in: 'body', required: false, type: 'number' },
      { name: 'cursor', in: 'body', required: false, type: 'string' },
    ],
  },
  SEARCH_MESSAGES: {
    method: 'GET',
    path: '/api/telegram/search/messages',
    usedFor: 'Keyword message search — Global Search / Events',
    params: [
      { name: 'q', in: 'query', required: true, type: 'string' },
      { name: 'limit', in: 'query', required: false, type: 'number' },
      { name: 'cursor', in: 'query', required: false, type: 'string' },
    ],
  },
  SEARCH_CHANNELS: {
    method: 'GET',
    path: '/api/telegram/search/channels',
    usedFor: 'Discover channels by keyword — Global Search profiles',
    params: [
      { name: 'q', in: 'query', required: true, type: 'string' },
      { name: 'limit', in: 'query', required: false, type: 'number' },
    ],
  },
  RESOLVE_LINK: {
    method: 'POST',
    path: '/api/telegram/resolve',
    usedFor: 'Parse t.me link → channel or message',
    params: [{ name: 'url', in: 'body', required: true, type: 'string' }],
  },
  CHECK_ACCESS: {
    method: 'POST',
    path: '/api/telegram/channel/access',
    usedFor: 'Can this session read the channel?',
    params: [
      { name: 'username', in: 'body', required: false, type: 'string' },
      { name: 'url', in: 'body', required: false, type: 'string' },
      { name: 'channel_id', in: 'body', required: false, type: 'string' },
    ],
  },
  JOIN_INVITE: {
    method: 'POST',
    path: '/api/telegram/invite/join',
    usedFor: 'Join via t.me/+invite before monitoring private sources',
    params: [{ name: 'invite', in: 'body', required: true, type: 'string' }],
  },
};

module.exports = { TELEGRAM_ENDPOINTS };
