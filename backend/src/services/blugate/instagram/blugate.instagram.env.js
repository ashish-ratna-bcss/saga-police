// Instagram Blugate gateway base URL (credentials from platforms table).
//
// Preferred:
//   BLUGATE_INSTAGRAM_HOST=https://blugate.blurasaga.com/api/gateway/instagram/api/instagram
// Also accepted (normalized to the same base):
//   .../api/gateway/instagram
//
// Endpoints are then /userInfo, /posts, /links, etc. (ig-downloader-api docs).

const { resolveGatewayBaseUrl, normalizeBaseUrl } = require('../blugate.http');

/** Normalize any pasted Blugate Instagram URL down to .../api/instagram */
const normalizeInstagramBase = (raw) => {
  let value = normalizeBaseUrl(raw);
  if (!value) return '';

  // Strip a trailing /get if the full sample endpoint was pasted as "base"
  value = value.replace(/\/get\/?$/i, '');

  // Gateway root only → append /api/instagram
  if (/\/api\/gateway\/instagram$/i.test(value)) {
    return `${value}/api/instagram`;
  }

  // Already ends with /api/instagram
  if (/\/api\/instagram$/i.test(value)) {
    return value;
  }

  return value;
};

const getInstagramBaseUrl = () => {
  const fromBlugate = resolveGatewayBaseUrl('instagram', ['BLUGATE_INSTAGRAM_HOST']);
  if (fromBlugate) return normalizeInstagramBase(fromBlugate);

  const direct = normalizeInstagramBase(process.env.INSTAGRAM_BASE_URL || '');
  if (direct) return direct;

  const host = String(process.env.RAPIDAPI_INSTAGRAM_HOST || '').trim();
  if (!host) return '';
  return normalizeInstagramBase(host);
};

module.exports = {
  getInstagramBaseUrl,
  normalizeInstagramBase,
};
