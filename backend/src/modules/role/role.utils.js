const ROLE_SLUGS = {
  ADMIN: 'admin',
  USER: 'user',
};

const SYSTEM_SLUGS = new Set(Object.values(ROLE_SLUGS));

const isSystemSlug = (slug) => SYSTEM_SLUGS.has(String(slug || '').toLowerCase());

/**
 * Assignment hierarchy: admin creates users only.
 */
const canAssignRole = (actorSlug, targetRole) => {
  const actor = String(actorSlug || '').toLowerCase();
  const target = String(targetRole?.slug || targetRole || '').toLowerCase();
  if (actor === ROLE_SLUGS.ADMIN) return target === ROLE_SLUGS.USER;
  return false;
};

module.exports = { ROLE_SLUGS, SYSTEM_SLUGS, isSystemSlug, canAssignRole };
