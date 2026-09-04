const validateLogin = (body = {}) => {
  const { username, password } = body;
  if (!username || !password) {
    return { ok: false, status: 400, message: 'Username and password are required' };
  }
  return { ok: true, data: { username, password } };
};

module.exports = { validateLogin };
