// X / Twitter Blugate gateway base URL (credentials come from platforms table, not .env).
// Prefer:
//   BLUGATE_TWITTER_HOST=https://blugate.blurasaga.com/api/gateway/twitter
//   or BLUGATE_BASE_URL=https://blugate.blurasaga.com  → appends /api/gateway/twitter
// Legacy fallback: X_BASE_URL

const normalizeBaseUrl = (raw) => {
  const value = String(raw || '').trim().replace(/\/$/, '');
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
};

const getXBaseUrl = () => {
  const direct = normalizeBaseUrl(
    process.env.BLUGATE_TWITTER_HOST || process.env.BLUGATE_X_HOST || ''
  );
  if (direct) return direct;

  const root = normalizeBaseUrl(process.env.BLUGATE_BASE_URL || process.env.BLUGATE_HOST || '');
  if (root) {
    if (/\/api\/gateway\/twitter\/?$/i.test(root)) return root.replace(/\/$/, '');
    if (/\/api\/gateway$/i.test(root)) return `${root}/twitter`;
    return `${root}/api/gateway/twitter`;
  }

  return normalizeBaseUrl(process.env.X_BASE_URL || '');
};

module.exports = {
  getXBaseUrl,
  normalizeBaseUrl,
};
