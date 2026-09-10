const ROLE_SLUGS = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  USER: 'user',
};

const SYSTEM_SLUGS = new Set(Object.values(ROLE_SLUGS));

const isSystemSlug = (slug) => SYSTEM_SLUGS.has(String(slug || '').toLowerCase());

/**
 * Hardcoded assignment hierarchy (roles are identity-only):
 * - superadmin → admin only
 * - admin → user only
 */
const canAssignRole = (actorSlug, targetRole) => {
  const actor = String(actorSlug || '').toLowerCase();
  const target = String(targetRole?.slug || targetRole || '').toLowerCase();
  if (actor === ROLE_SLUGS.SUPERADMIN) return target === ROLE_SLUGS.ADMIN;
  if (actor === ROLE_SLUGS.ADMIN) return target === ROLE_SLUGS.USER;
  return false;
};

module.exports = { ROLE_SLUGS, SYSTEM_SLUGS, isSystemSlug, canAssignRole };
