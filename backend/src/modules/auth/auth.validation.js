const validateLogin = (body = {}) => {
  const username = String(body.username || '').trim().toLowerCase();
  const password = body.password;
  if (!username || !password) {
    return { ok: false, status: 400, message: 'Username and password are required' };
  }
  return { ok: true, data: { username, password } };
};

module.exports = { validateLogin };
