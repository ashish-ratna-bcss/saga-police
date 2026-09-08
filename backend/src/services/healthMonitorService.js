const axios = require('axios');
const callTelegramApi = require('./blugate/telegram/blugate.telegram.api_client');
const { getTelegramBaseUrl } = require('./blugate/telegram/blugate.telegram.env');

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
const pingService = async (url, path = '') => {
  if (!url) return { status: 'offline', error: 'Not configured' };
  try {
    const target = url.endsWith('/') ? `${url.slice(0, -1)}${path}` : `${url}${path}`;
    const start = Date.now();
    await axios.get(target, { timeout: PING_TIMEOUT_MS });
    return { status: 'online', latency: Date.now() - start };
  } catch (error) {
    return { status: 'offline', error: error.code || error.message };
  }
};

const checkPostgres = async () => {
  try {
    const prisma = require('../../prisma/client');
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'online', latency: Date.now() - start };
  } catch (error) {
    return { status: 'offline', error: error.message };
  }
};

const checkTelegram = async () => {
  const base = getTelegramBaseUrl();
  if (!base) {
    return {
      status: 'offline',
      error: 'Not configured',
      connected: false,
      authorized: false,
    };
  }

  const ready = await pingService(base, '/ready');
  if (ready.status !== 'online') {
    const live = await pingService(base, '/health');
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
    callTelegramApi('STATUS').then((status) => ({ ok: true, status })).catch((err) => ({
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

const readQuotaFromService = (requirePath) => {
  try {
    const service = require(requirePath);
    if (!service.getKeyHealthStatus) {
      return { totalCalls: 0, remaining: 'Unknown', limit: 'Unknown' };
    }
    const health = service.getKeyHealthStatus();
    const firstKey = Array.isArray(health) ? health[0] : null;
    if (!firstKey) {
      return { totalCalls: 0, remaining: 'Unknown', limit: 'Unknown' };
    }
    return {
      totalCalls: firstKey.totalCalls || 0,
      remaining: firstKey.remaining !== null ? firstKey.remaining : 'Unknown',
      limit: firstKey.limit !== null ? firstKey.limit : 'Unknown',
      available: firstKey.available,
    };
  } catch {
    return { totalCalls: 0, remaining: 'Unknown', limit: 'Unknown' };
  }
};

const checkSystemHealth = async () => {
  // Run probes in parallel — sequential pings were ~12s when hosts were unreachable.
  const [postgres, ollama, sentiment, mediaAnalyzer, ragApi, bluweb, telegram] =
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
      checkTelegram(),
    ]);

  const instagramLimit = readQuotaFromService('./rapidApiInstagramService');
  const facebookLimit = readQuotaFromService('./rapidApiFacebookService');
  const xLimit = readQuotaFromService('./rapidApiXService');
  const youtubeLimit = readQuotaFromService('./youtube.service');

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
    },
    quotas: {
      totalOverallCalls:
        (instagramLimit.totalCalls || 0) +
        (facebookLimit.totalCalls || 0) +
        (xLimit.totalCalls || 0) +
        (youtubeLimit.totalCalls || 0),
      instagram: instagramLimit,
      facebook: facebookLimit,
      x: xLimit,
      youtube: youtubeLimit,
    },
  };
};

module.exports = {
  checkSystemHealth,
};
