const { ROLE_SLUGS } = require('./role.utils');

const validateCreateRole = (body = {}) => {
  const name = String(body.name || '').trim();
  const slug = String(body.slug || '').trim().toLowerCase().replace(/\s+/g, '-');
  const allowed_pages = Array.isArray(body.allowed_pages) ? body.allowed_pages : [];
  const can_manage_users = Boolean(body.can_manage_users);
  const assignableSet = new Set(
    (Array.isArray(body.assignable_by) ? body.assignable_by : []).map((s) => String(s).toLowerCase())
  );
  assignableSet.add('superadmin');
  const assignable_by = [...assignableSet];

  if (!name || !slug) {
    return { ok: false, status: 400, message: 'name and slug are required' };
  }
  if (Object.values(ROLE_SLUGS).includes(slug)) {
    return { ok: false, status: 400, message: 'Cannot create a role with a reserved system slug' };
  }
  return { ok: true, data: { name, slug, allowed_pages, can_manage_users, assignable_by } };
};

const validateUpdateRole = (body = {}, existing) => {
  const data = {};
  if (body.name != null) data.name = String(body.name).trim();
  if (Array.isArray(body.allowed_pages)) data.allowed_pages = body.allowed_pages;
  if (Array.isArray(body.assignable_by)) {
    // superadmin must always be able to assign every role.
    const set = new Set(body.assignable_by.map((s) => String(s).toLowerCase()));
    set.add(ROLE_SLUGS.SUPERADMIN);
    data.assignable_by = [...set];
  }
  if (typeof body.can_manage_users === 'boolean' && !existing?.is_system) {
    data.can_manage_users = body.can_manage_users;
  }
  if (existing?.is_system && body.slug && body.slug !== existing.slug) {
    return { ok: false, status: 400, message: 'Cannot change system role slug' };
  }
  if (!existing?.is_system && body.slug != null) {
    data.slug = String(body.slug).trim().toLowerCase().replace(/\s+/g, '-');
  }
  return { ok: true, data };
};

module.exports = { validateCreateRole, validateUpdateRole };
