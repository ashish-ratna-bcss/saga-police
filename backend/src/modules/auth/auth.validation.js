const validateLogin = (body = {}) => {
  const username = String(body.username || '').trim().toLowerCase();
  const password = body.password;
  if (!username || !password) {
    return { ok: false, status: 400, message: 'Username and password are required' };
  }
  const force = body.force === true || body.force === 'true' || body.force === 1;
  return { ok: true, data: { username, password, force } };
};

module.exports = { validateLogin };
