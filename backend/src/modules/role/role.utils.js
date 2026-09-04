const ROLE_SLUGS = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  USER: 'user',
};

const SYSTEM_SLUGS = new Set(Object.values(ROLE_SLUGS));

const isSystemSlug = (slug) => SYSTEM_SLUGS.has(String(slug || '').toLowerCase());

// Whether `actorSlug` may assign `targetRole` (the full role record, so
// custom roles' `assignable_by` list is respected, not just the 3 system slugs).
const canAssignRole = (actorSlug, targetRole) => {
  const actor = String(actorSlug || '').toLowerCase();
  if (actor === ROLE_SLUGS.SUPERADMIN) return true;
  const list = Array.isArray(targetRole?.assignable_by) ? targetRole.assignable_by : [];
  return list.map((s) => String(s).toLowerCase()).includes(actor);
};

module.exports = { ROLE_SLUGS, SYSTEM_SLUGS, isSystemSlug, canAssignRole };
