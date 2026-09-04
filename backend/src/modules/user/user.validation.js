const validateCreateUser = (body = {}) => {
  const name = String(body.full_name || body.name || '').trim();
  const email = String(body.email || '').toLowerCase().trim();
  const username = String(body.username || email.split('@')[0] || '').trim().toLowerCase();
  const password = String(body.password || '');
  const role = String(body.role || body.role_slug || 'user').trim().toLowerCase();

  if (!name || !email || !password || !username) {
    return { ok: false, status: 400, message: 'Please add all fields (name, username, email, password, role)' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { ok: false, status: 400, message: 'Invalid email' };
  }
  if (password.length < 8 || password.length > 200) {
    return { ok: false, status: 400, message: 'Password must be 8–200 characters' };
  }
  return { ok: true, data: { name, email, username, password, role } };
};

const validateUpdateUser = (body = {}) => {
  const data = {};
  if (body.full_name != null || body.name != null) data.name = String(body.full_name || body.name).trim();
  if (body.email != null) data.email = String(body.email).toLowerCase().trim();
  if (body.username != null) data.username = String(body.username).trim().toLowerCase();
  if (body.role != null || body.role_slug != null) data.role = String(body.role || body.role_slug).trim().toLowerCase();
  if (body.password && String(body.password).trim() !== '') {
    const password = String(body.password);
    if (password.length < 8 || password.length > 200) {
      return { ok: false, status: 400, message: 'Password must be 8–200 characters' };
    }
    data.password = password;
  }
  return { ok: true, data };
};

module.exports = { validateCreateUser, validateUpdateUser };
