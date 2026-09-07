const axios = require('axios');
const callTelegramApi = require('./blugate/telegram/blugate.telegram.api_client');
const { getTelegramBaseUrl } = require('./blugate/telegram/blugate.telegram.env');

// Internal service ping helper
const pingService = async (url, path = '') => {
  if (!url) return { status: 'offline', error: 'Not configured' };
  try {
    const target = url.endsWith('/') ? `${url.slice(0, -1)}${path}` : `${url}${path}`;
    const start = Date.now();
    await axios.get(target, { timeout: 3000 });
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

  let connected = false;
  let authorized = false;
  let account = null;
  try {
    const status = await callTelegramApi('STATUS');
    connected = Boolean(
      status?.connected ?? status?.authorized ?? status?.authenticated ?? status?.ok
    );
    authorized = Boolean(
      status?.authorized ?? status?.authenticated ?? status?.connected ?? false
    );
    account = status?.account || null;
    if (status?.status === 'ok' && status?.telegram_configured != null) {
      connected = Boolean(status.telegram_configured);
      authorized = connected;
    }
  } catch (err) {
    return {
      status: 'online',
      latency: ready.latency,
      error: err.message,
      connected: false,
      authorized: false,
      degraded: true,
    };
  }

  return {
    status: connected || authorized ? 'online' : 'degraded',
    latency: ready.latency,
    connected,
    authorized,
    account,
  };
};

const checkSystemHealth = async () => {
  const postgres = await checkPostgres();

  const ollama = await pingService(process.env.OLLAMA_BASE_URL, '/api/tags');
  const sentiment = await pingService(
    process.env.INTELLIGENCE_SERVICE_URL || process.env.CUSTOM_SENTIMENT_URL,
    '/health'
  );
  const mediaAnalyzer = await pingService(process.env.MEDIA_ANALYZER_URL, '/health');
  const ragApi = await pingService(process.env.RAG_API_URL, '/api/rag/health');
  const bluweb = await pingService(process.env.BLUWEB_API_URL, '/health/ready');
  const telegram = await checkTelegram();

  let instagramLimit = { totalCalls: 0, remaining: 'Unknown', limit: 'Unknown' };
  let facebookLimit = { totalCalls: 0, remaining: 'Unknown', limit: 'Unknown' };
  let xLimit = { totalCalls: 0, remaining: 'Unknown', limit: 'Unknown' };
  let youtubeLimit = { totalCalls: 0, remaining: 'Unknown', limit: 'Unknown' };

  try {
    const igService = require('./rapidApiInstagramService');
    if (igService.getKeyHealthStatus) {
      const igHealth = igService.getKeyHealthStatus();
      const firstKey = Array.isArray(igHealth) ? igHealth[0] : null;
      if (firstKey) {
        instagramLimit = {
          totalCalls: firstKey.totalCalls || 0,
          remaining: firstKey.remaining !== null ? firstKey.remaining : 'Unknown',
          limit: firstKey.limit !== null ? firstKey.limit : 'Unknown',
          available: firstKey.available,
        };
      }
    }
  } catch (e) {}

  try {
    const fbService = require('./rapidApiFacebookService');
    if (fbService.getKeyHealthStatus) {
      const fbHealth = fbService.getKeyHealthStatus();
      const firstKey = Array.isArray(fbHealth) ? fbHealth[0] : null;
      if (firstKey) {
        facebookLimit = {
          totalCalls: firstKey.totalCalls || 0,
          remaining: firstKey.remaining !== null ? firstKey.remaining : 'Unknown',
          limit: firstKey.limit !== null ? firstKey.limit : 'Unknown',
          available: firstKey.available,
        };
      }
    }
  } catch (e) {}

  try {
    const xService = require('./rapidApiXService');
    if (xService.getKeyHealthStatus) {
      const xHealth = xService.getKeyHealthStatus();
      const firstKey = Array.isArray(xHealth) ? xHealth[0] : null;
      if (firstKey) {
        xLimit = {
          totalCalls: firstKey.totalCalls || 0,
          remaining: firstKey.remaining !== null ? firstKey.remaining : 'Unknown',
          limit: firstKey.limit !== null ? firstKey.limit : 'Unknown',
          available: firstKey.available,
        };
      }
    }
  } catch (e) {}

  try {
    const ytService = require('./youtube.service');
    if (ytService.getKeyHealthStatus) {
      const ytHealth = ytService.getKeyHealthStatus();
      const firstKey = Array.isArray(ytHealth) ? ytHealth[0] : null;
      if (firstKey) {
        youtubeLimit = {
          totalCalls: firstKey.totalCalls || 0,
          remaining: firstKey.remaining !== null ? firstKey.remaining : 'Unknown',
          limit: firstKey.limit !== null ? firstKey.limit : 'Unknown',
          available: firstKey.available,
        };
      }
    }
  } catch (e) {}

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
