const { jwtExpiresInToMs } = require('./env');

const BASE_NAME = 'token';

/** Secure only when the request is HTTPS (nginx X-Forwarded-Proto). */
const isHttpsRequest = (req) => {
  if (!req) return false;
  const xf = String(req.get?.('x-forwarded-proto') || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (xf === 'https') return true;
  if (xf === 'http') return false;
  return Boolean(req.secure);
};

/**
 * Cookie name scoped by UI port when present.
 * Browsers ignore port for cookie host-matching, so http://IP:3001 and
 * http://IP:3002 would otherwise share one session. Domains without an
 * explicit port (odisha.blurasaga.com) keep a plain "token" — host already
 * isolates them.
 */
const cookieName = (req) => {
  const host = String(req?.get?.('x-forwarded-host') || req?.get?.('host') || '');
  const hostPort = host.match(/:(\d+)$/);
  if (hostPort) return `${BASE_NAME}_${hostPort[1]}`;

  const origin = String(req?.get?.('origin') || '');
  const originPort = origin.match(/:(\d+)$/);
  if (originPort) return `${BASE_NAME}_${originPort[1]}`;

  return BASE_NAME;
};

const cookieOptions = (req) => {
  const crossSite = String(process.env.COOKIE_CROSS_SITE || '').toLowerCase() === 'true';
  const secure = crossSite || isHttpsRequest(req);
  return {
    httpOnly: true,
    secure,
    sameSite: crossSite ? 'none' : 'lax',
    path: '/',
  };
};

/** Create — set the auth session cookie on the response. */
const createAuthCookie = (res, token, req) => {
  res.cookie(cookieName(req), token, {
    ...cookieOptions(req),
    maxAge: jwtExpiresInToMs(),
  });
};

/** Read — get the auth token from the request cookies. */
const readAuthCookie = (req) => {
  if (!req?.cookies) return null;
  return req.cookies[cookieName(req)] || null;
};

/** Update — overwrite the auth session cookie. */
const updateAuthCookie = (res, token, req) => createAuthCookie(res, token, req);

/** Delete — clear the auth session cookie for this UI port/host. */
const deleteAuthCookie = (res, req) => {
  const opts = cookieOptions(req);
  res.clearCookie(cookieName(req), opts);
  // Clear legacy unscoped name if present (pre–port-scoped cookies)
  res.clearCookie(BASE_NAME, opts);
  if (req?.cookies) {
    Object.keys(req.cookies).forEach((c) => {
      if (c.startsWith(BASE_NAME)) {
        res.clearCookie(c, opts);
      }
    });
  }
};

module.exports = {
  createAuthCookie,
  readAuthCookie,
  updateAuthCookie,
  deleteAuthCookie,
};
