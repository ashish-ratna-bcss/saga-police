const axios = require('axios');
const callTelegramApi = require('../../services/blugate/telegram/blugate.telegram.api_client');
const { getTelegramBaseUrl } = require('../../services/blugate/telegram/blugate.telegram.env');
const { callGlobalApi, resolveGlobalAuth } = require('../../services/blugate/global/blugate.global.api_client');

/** Keep health probes short so the Health page does not sit on skeletons. */
const PING_TIMEOUT_MS = 1500;
const TELEGRAM_STATUS_TIMEOUT_MS = 2000;

const withTimeout = (promise, ms, onTimeout) => {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(typeof onTimeout === 'function' ? onTimeout() : onTimeout), ms);
    }),
  ]);
};

// Internal service ping helper
const pingService = async (url, path = '', headers = undefined) => {
  if (!url) return { status: 'offline', error: 'Not configured' };
  try {
    const target = url.endsWith('/') ? `${url.slice(0, -1)}${path}` : `${url}${path}`;
    const start = Date.now();
    await axios.get(target, { timeout: PING_TIMEOUT_MS, headers });
    return { status: 'online', latency: Date.now() - start };
  } catch (error) {
    const http = error.response?.status;
    return {
      status: 'offline',
      error: http === 401 || http === 403 ? 'Unauthorized: BluGate keys are missing or invalid' : error.code || error.message,
    };
  }
};

const checkPostgres = async () => {
  try {
    const prisma = require('../../../prisma/client');
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'online', latency: Date.now() - start };
  } catch (error) {
    return { status: 'offline', error: error.message };
  }
};

const checkTelegram = async (db) => {
  const base = getTelegramBaseUrl();
  if (!base) {
    return {
      status: 'offline',
      error: 'Not configured',
      connected: false,
      authorized: false,
    };
  }

  // Through the BluGate gateway every Telegram call needs the client credentials (401 without them).
  // BluGate uses one client account for every platform, so the shared credentials are used here.
  let auth = null;
  try {
    auth = db ? await resolveGlobalAuth(db) : null;
  } catch {
    auth = null;
  }
  const authHeaders = auth
    ? { Authorization: `Bearer ${auth.accessKey}`, 'x-client-id': auth.clientId }
    : undefined;

  const ready = await pingService(base, '/ready', authHeaders);
  if (ready.status !== 'online') {
    const live = await pingService(base, '/health', authHeaders);
    return {
      status: live.status,
      latency: live.latency,
      error: live.error || ready.error,
      connected: false,
      authorized: false,
    };
  }

  // STATUS can hang up to 60s in the client — race it for health checks.
  const statusResult = await withTimeout(
    callTelegramApi('STATUS', {}, auth).then((status) => ({ ok: true, status })).catch((err) => ({
      ok: false,
      error: err.message,
    })),
    TELEGRAM_STATUS_TIMEOUT_MS,
    () => ({ ok: false, error: 'STATUS timeout', timedOut: true })
  );

  if (!statusResult.ok) {
    return {
      status: statusResult.timedOut ? 'degraded' : 'online',
      latency: ready.latency,
      error: statusResult.error,
      connected: false,
      authorized: false,
      degraded: true,
    };
  }

  const status = statusResult.status || {};
  let connected = Boolean(
    status?.connected ?? status?.authorized ?? status?.authenticated ?? status?.ok
  );
  let authorized = Boolean(
    status?.authorized ?? status?.authenticated ?? status?.connected ?? false
  );
  const account = status?.account || null;
  if (status?.status === 'ok' && status?.telegram_configured != null) {
    connected = Boolean(status.telegram_configured);
    authorized = connected;
  }

  return {
    status: connected || authorized ? 'online' : 'degraded',
    latency: ready.latency,
    connected,
    authorized,
    account,
  };
};

/**
 * Reddit is served by the unified service, not by BluGate. /ready says whether the service has Reddit
 * API credentials. Without them only the public-feed search works (about 1 request per minute, shared).
 */
const checkReddit = async () => {
  const base = String(process.env.REDDIT_UNIFIED_API_URL || '').replace(/\/+$/, '');
  if (!base) return { status: 'offline', error: 'Not configured' };
  const start = Date.now();
  try {
    const { data } = await axios.get(`${base}/ready`, { timeout: PING_TIMEOUT_MS * 2 });
    const configured = Boolean(data?.reddit_configured);
    return {
      status: configured ? 'online' : 'degraded',
      latency: Date.now() - start,
      configured,
      mode: configured ? 'login' : 'public_feed',
    };
  } catch (error) {
    return { status: 'offline', error: error.code || error.message };
  }
};

const unknownQuota = () => ({
  totalCalls: 0,
  remaining: 'n/a',
  limit: 'n/a',
});

const blugateConfigured = (getBaseUrl, getApiKey) => {
  try {
    const base = typeof getBaseUrl === 'function' ? getBaseUrl() : null;
    const key = typeof getApiKey === 'function' ? getApiKey() : null;
    return Boolean(base && key);
  } catch {
    return false;
  }
};

/**
 * BluGate's global client-account endpoints (/health + /billing), per
 * blugateapis/global-blugate-documentation.json — delegated to the proper
 * services/blugate/global module (base URL, auth, request plumbing all live there,
 * same as every other platform's Blugate client) rather than calling axios directly here.
 */
const checkBlugateGlobal = async (db) => {
  if (!db) return { status: 'offline', error: 'No tenant database' };

  const auth = await resolveGlobalAuth(db);
  if (!auth) return { status: 'offline', error: 'Not configured' };

  const start = Date.now();
  try {
    const [health, billingResult] = await Promise.all([
      callGlobalApi('HEALTH', {}, auth),
      callGlobalApi('BILLING', {}, auth).catch((err) => ({ __error: err.message })),
    ]);
    const billing = billingResult && billingResult.__error ? null : billingResult;
    return {
      status: 'online',
      latency: Date.now() - start,
      health,
      billing,
    };
  } catch (error) {
    return { status: 'offline', error: error.message || error.code };
  }
};

const checkSystemHealth = async (db) => {
  // Run probes in parallel — sequential pings were ~12s when hosts were unreachable.
  const [postgres, ollama, sentiment, mediaAnalyzer, ragApi, bluweb, telegram, reddit, blugate] =
    await Promise.all([
      checkPostgres(),
      pingService(process.env.OLLAMA_BASE_URL, '/api/tags'),
      pingService(
        process.env.INTELLIGENCE_SERVICE_URL || process.env.CUSTOM_SENTIMENT_URL,
        '/health'
      ),
      pingService(process.env.MEDIA_ANALYZER_URL, '/health'),
      pingService(process.env.RAG_API_URL, '/api/rag/health'),
      pingService(process.env.BLUWEB_API_URL, '/health/ready'),
      checkTelegram(db),
      checkReddit(),
      checkBlugateGlobal(db),
    ]);

  // RapidAPI quota trackers removed — Blugate providers do not expose key quotas here.
  const igEnv = require('../../services/blugate/instagram/blugate.instagram.env');
  const fbEnv = require('../../services/blugate/facebook/blugate.facebook.env');
  const xEnv = require('../../services/blugate/x/blugate.x.env');
  const ytEnv = require('../../services/blugate/youtube/blugate.youtube.env');

  const instagramLimit = {
    ...unknownQuota(),
    configured: blugateConfigured(igEnv.getInstagramBaseUrl, igEnv.getInstagramApiKey),
  };
  const facebookLimit = {
    ...unknownQuota(),
    configured: blugateConfigured(fbEnv.getFacebookBaseUrl, fbEnv.getFacebookApiKey),
  };
  const xLimit = {
    ...unknownQuota(),
    configured: blugateConfigured(xEnv.getXBaseUrl, xEnv.getXApiKey),
  };
  const youtubeLimit = {
    ...unknownQuota(),
    configured: Boolean(ytEnv.getYouTubeApiKey && ytEnv.getYouTubeApiKey()),
  };

  return {
    timestamp: new Date().toISOString(),
    postgres,
    services: {
      ollama,
      sentiment,
      mediaAnalyzer,
      ragApi,
      bluweb,
      telegram,
      reddit,
      blugate,
    },
    quotas: {
      totalOverallCalls: 0,
      instagram: instagramLimit,
      facebook: facebookLimit,
      x: xLimit,
      youtube: youtubeLimit,
    },
  };
};

module.exports = {
  checkSystemHealth,
  checkTelegram,
  checkReddit,
};
