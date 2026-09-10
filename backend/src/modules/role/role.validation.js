const { ROLE_SLUGS, isSystemSlug } = require('./role.utils');

const validateCreateRole = (body = {}) => {
  const name = String(body.name || '').trim();
  const slug = String(body.slug || '').trim().toLowerCase().replace(/\s+/g, '-');

  if (!name || !slug) {
    return { ok: false, status: 400, message: 'name and slug are required' };
  }
  if (Object.values(ROLE_SLUGS).includes(slug) || isSystemSlug(slug)) {
    return { ok: false, status: 400, message: 'Cannot create a role with a reserved system slug' };
  }
  return { ok: true, data: { name, slug } };
};

const validateUpdateRole = (body = {}, existing) => {
  const data = {};
  if (body.name != null) data.name = String(body.name).trim();
  if (existing?.is_system && body.slug && body.slug !== existing.slug) {
    return { ok: false, status: 400, message: 'Cannot change system role slug' };
  }
  if (!existing?.is_system && body.slug != null) {
    data.slug = String(body.slug).trim().toLowerCase().replace(/\s+/g, '-');
  }
  return { ok: true, data };
};

module.exports = { validateCreateRole, validateUpdateRole };
