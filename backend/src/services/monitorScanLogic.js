/**
 * Pure monitoring / analysis decision logic.
 *
 * Kept free of platform SDKs, mongoose models and uuid so the regression
 * self-checks can exercise the real production functions without booting the
 * rest of monitorService. monitorService.js re-exports every symbol here.
 */
const logger = require('../utils/logger');
const { hasAnalyzableContent } = require('../utils/contentText');

const shouldSkipContentAnalysis = (content) => !hasAnalyzableContent(content);

// ─── Source scan outcomes ──────────────────────────────────────────────────
const SCAN_OUTCOME = {
  OK: 'OK',
  API_ERROR: 'API_ERROR',
  RATE_LIMIT: 'RATE_LIMIT',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  AUTH_CONFIG: 'AUTH_CONFIG',
  IDENTITY_UNRESOLVED: 'IDENTITY_UNRESOLVED',
  TIMEOUT_NETWORK: 'TIMEOUT_NETWORK'
};

const scanResult = (items = [], outcome = SCAN_OUTCOME.OK, detail = null, stats = null) => ({
  items,
  outcome,
  detail,
  stats
});

const isYoutubeQuotaError = (error) => (
  error?.errors?.[0]?.reason === 'quotaExceeded' ||
  /quota/i.test(String(error?.message || ''))
);

const classifyScanError = (error) => {
  if (!error) return SCAN_OUTCOME.API_ERROR;
  if (error.isRateLimit || error.code === 'FB_RAPIDAPI_COOLDOWN' || error?.response?.status === 429) {
    return SCAN_OUTCOME.RATE_LIMIT;
  }
  if (isYoutubeQuotaError(error)) return SCAN_OUTCOME.QUOTA_EXCEEDED;
  if (['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND'].includes(error.code) ||
      /timeout|network|socket/i.test(String(error.message || ''))) {
    return SCAN_OUTCOME.TIMEOUT_NETWORK;
  }
  return SCAN_OUTCOME.API_ERROR;
};

const PLATFORM_QUOTA_COOLDOWN_MS = Math.max(
  1000,
  Number(process.env.PLATFORM_QUOTA_COOLDOWN_MS) || 6 * 60 * 60 * 1000
);

const platformQuotaState = Object.create(null);

const formatCooldown = (ms) => {
  if (ms >= 3600000) return `${(ms / 3600000).toFixed(1)}h`;
  if (ms >= 60000) return `${Math.round(ms / 60000)} min`;
  return `${Math.round(ms / 1000)}s`;
};

const markPlatformQuotaLimited = (platform, outcome, detail) => {
  const previous = platformQuotaState[platform];
  const now = Date.now();

  if (previous && now < previous.retry_at.getTime()) {
    previous.last_checked_at = new Date(now);
    if (detail) previous.detail = detail;
    return;
  }

  platformQuotaState[platform] = {
    outcome,
    detail: detail || null,
    since: previous?.since || new Date(now),
    last_checked_at: new Date(now),
    retry_at: new Date(now + PLATFORM_QUOTA_COOLDOWN_MS),
    checks: (previous?.checks || 0) + 1
  };
  logger.warn(
    `[Monitor:${platform}] ⛔ ${outcome} — pausing ${platform} fetch/analysis for ${formatCooldown(PLATFORM_QUOTA_COOLDOWN_MS)} ` +
    `(re-check at ${platformQuotaState[platform].retry_at.toISOString()}, attempt #${platformQuotaState[platform].checks}). ` +
    'Other platforms are unaffected.'
  );
};

const clearPlatformQuotaLimit = (platform) => {
  const state = platformQuotaState[platform];
  if (!state) return;
  if (Date.now() < state.retry_at.getTime()) return;
  delete platformQuotaState[platform];
  logger.info(`[Monitor:${platform}] ✅ Quota/rate limit cleared — resuming normal fetch and analysis`);
};

const getPlatformQuotaPause = (platform) => {
  const state = platformQuotaState[platform];
  if (!state) return null;
  if (Date.now() >= state.retry_at.getTime()) return null;
  return state;
};

const getPlatformQuotaStatus = () => JSON.parse(JSON.stringify(platformQuotaState));

const VIRALITY_RANK = { low: 1, medium: 2, high: 3 };

const isViralityUpgrade = (current, next) => {
  if (!next) return false;
  if (!current) return true;
  return (VIRALITY_RANK[next] || 0) > (VIRALITY_RANK[current] || 0);
};

const ANALYSIS_STATUS = {
  ANALYZED: 'analyzed',
  SKIPPED_NO_TEXT: 'skipped_no_text',
  FAILED: 'failed'
};

const isUsableAnalysis = (analysis) =>
  Boolean(analysis) && analysis.status === ANALYSIS_STATUS.ANALYZED;

const buildExistingAlertUpdate = (existingAlert, {
  viralityLevel = null,
  velocityData = undefined,
  velocityPriority = null,
  riskRefresh = null
} = {}) => {
  if (!existingAlert) return null;
  const setDoc = {};

  if (isViralityUpgrade(existingAlert.virality_level, viralityLevel)) {
    setDoc.virality_level = viralityLevel;
    if (velocityData !== undefined) setDoc.velocity_data = velocityData;
    if (velocityPriority) setDoc.priority = String(velocityPriority).toUpperCase();
    if (!existingAlert.virality_detected_at) {
      setDoc.virality_detected_at = new Date();
    }
  }

  if (riskRefresh) {
    Object.assign(setDoc, riskRefresh);
  }

  return Object.keys(setDoc).length > 0 ? { $set: setDoc } : null;
};

const selectPendingForRetry = ({
  newest = [],
  oldest = [],
  analyzedIds = new Set(),
  limit = 100,
  now = Date.now(),
  liveRatio = 0.7,
  isEligible = null
} = {}) => {
  const analyzed = analyzedIds instanceof Set ? analyzedIds : new Set(analyzedIds || []);
  const eligible = typeof isEligible === 'function'
    ? isEligible
    : () => true;
  const isPending = (c) =>
    c?.id && !analyzed.has(c.id) && hasAnalyzableContent(c) && eligible(c, now);

  const oldestPending = oldest.filter(isPending);
  const newestPending = newest.filter(isPending);

  const ratio = Math.min(0.9, Math.max(0.5, Number(liveRatio) || 0.7));
  const liveShare = Math.min(newestPending.length, Math.ceil(limit * ratio));

  const picked = [];
  const seen = new Set();
  const take = (list, count) => {
    for (const c of list) {
      if (picked.length >= limit || count <= 0) break;
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      picked.push(c.id);
      count -= 1;
    }
  };

  // Reserve most of the batch for live/new posts; remainder drains backlog.
  take(newestPending, liveShare);
  take(oldestPending, limit - picked.length);
  take(newestPending, limit - picked.length);

  return picked;
};

module.exports = {
  shouldSkipContentAnalysis,
  SCAN_OUTCOME,
  scanResult,
  isYoutubeQuotaError,
  classifyScanError,
  PLATFORM_QUOTA_COOLDOWN_MS,
  formatCooldown,
  markPlatformQuotaLimited,
  clearPlatformQuotaLimit,
  getPlatformQuotaPause,
  getPlatformQuotaStatus,
  VIRALITY_RANK,
  isViralityUpgrade,
  ANALYSIS_STATUS,
  isUsableAnalysis,
  buildExistingAlertUpdate,
  selectPendingForRetry
};
