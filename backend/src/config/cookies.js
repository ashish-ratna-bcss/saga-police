const { isProduction, jwtExpiresInToMs } = require('./env');

const NAME = 'token';

/** Create — set the auth session cookie on the response. */
const createAuthCookie = (res, token) => {
  const crossSite = String(process.env.COOKIE_CROSS_SITE || '').toLowerCase() === 'true';
  res.cookie(NAME, token, {
    httpOnly: true,
    secure: crossSite || isProduction(),
    sameSite: crossSite ? 'none' : 'lax',
    path: '/',
    maxAge: jwtExpiresInToMs(),
  });
};

/** Read — get the auth token from the request cookies. */
const readAuthCookie = (req) => {
  if (!req?.cookies) return null;
  return req.cookies[NAME] || null;
};

/** Update — overwrite the auth session cookie. */
const updateAuthCookie = (res, token) => createAuthCookie(res, token);

/** Delete — clear the auth session cookie. */
const deleteAuthCookie = (res) => {
  const crossSite = String(process.env.COOKIE_CROSS_SITE || '').toLowerCase() === 'true';
  res.clearCookie(NAME, {
    httpOnly: true,
    secure: crossSite || isProduction(),
    sameSite: crossSite ? 'none' : 'lax',
    path: '/',
  });
};

module.exports = {
  createAuthCookie,
  readAuthCookie,
  updateAuthCookie,
  deleteAuthCookie,
};
