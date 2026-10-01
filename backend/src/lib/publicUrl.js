/**
 * Multi-tenant public base URL for /files/... and report links.
 *
 * Prefer the incoming request host (nginx sets X-Forwarded-Host / Proto per
 * tenant domain, e.g. odisha.blurasaga.com vs delhipolice.blurasaga.com).
 * PUBLIC_BACKEND_URL is only a fallback when there is no request (jobs/scripts).
 */

const stripSlash = (s) => String(s || '').replace(/\/+$/, '');

const forwardedFirst = (value) => {
  if (!value) return '';
  return String(value).split(',')[0].trim();
};

/**
 * @param {import('express').Request|null|undefined} req
 * @returns {string} e.g. https://odisha.blurasaga.com  or '' for relative paths
 */
function publicBaseFromReq(req) {
  if (req) {
    const proto =
      forwardedFirst(req.get?.('x-forwarded-proto')) ||
      req.protocol ||
      'https';
    const host =
      forwardedFirst(req.get?.('x-forwarded-host')) ||
      req.get?.('host') ||
      '';
    if (host) {
      return stripSlash(`${proto}://${host}`);
    }
  }

  return stripSlash(process.env.PUBLIC_BACKEND_URL || '');
}

/**
 * @param {string} key storage key under REPORT_STORAGE_DIR
 * @param {import('express').Request|null|undefined} req
 */
function buildPublicFileUrl(key, req) {
  const pathPart = `/files/${String(key)
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  const base = publicBaseFromReq(req);
  return base ? `${base}${pathPart}` : pathPart;
}

module.exports = {
  publicBaseFromReq,
  buildPublicFileUrl,
};
