const {
  PAGE_CATALOG,
  PLATFORM_CATALOG,
  getDefaultAccessForRole,
  GRANTABLE_TO_ADMIN_PATHS,
  GRANTABLE_TO_USER_PATHS,
  SUPERADMIN_PAGE_PATHS,
} = require('../auth/access_features');
const { ROLE_SLUGS } = require('../role/role.utils');

const uniqueStrings = (arr) =>
  [...new Set((Array.isArray(arr) ? arr : []).map((s) => String(s).trim()).filter(Boolean))];

const intersectAccess = (requested, allowed) => {
  const allow = new Set((allowed || []).map(String));
  return uniqueStrings(requested).filter((item) => allow.has(item));
};

/**
 * Resolve access for create/update.
 * Superadmin → admin: pages from GRANTABLE_TO_ADMIN (ops + users/access).
 * Admin → user: pages ⊆ actor ∩ GRANTABLE_TO_USER.
 * Superadmin own row is not updated via this path normally.
 */
const resolveAccessForAssignee = (actor, roleSlug, body = {}) => {
  const defaults = getDefaultAccessForRole(roleSlug);
  const isSuper = actor?.role === ROLE_SLUGS.SUPERADMIN;
  const target = String(roleSlug || 'user').toLowerCase();

  let allowed_pages = Array.isArray(body.allowed_pages)
    ? uniqueStrings(body.allowed_pages)
    : [...defaults.allowed_pages];
  let allowed_platforms = Array.isArray(body.allowed_platforms)
    ? uniqueStrings(body.allowed_platforms)
    : [...defaults.allowed_platforms];

  const grantPool =
    target === ROLE_SLUGS.ADMIN
      ? GRANTABLE_TO_ADMIN_PATHS
      : target === ROLE_SLUGS.SUPERADMIN
        ? SUPERADMIN_PAGE_PATHS
        : GRANTABLE_TO_USER_PATHS;

  allowed_pages = allowed_pages.filter((p) => grantPool.includes(p));

  if (!isSuper) {
    allowed_pages = intersectAccess(allowed_pages, actor.allowed_pages || []);
    allowed_platforms = intersectAccess(allowed_platforms, actor.allowed_platforms || []);
  } else {
    allowed_platforms = allowed_platforms.filter((p) => PLATFORM_CATALOG.includes(p));
  }

  let can_manage_users = defaults.can_manage_users;

  if (typeof body.can_manage_users === 'boolean') {
    can_manage_users = body.can_manage_users;
  }

  if (target === ROLE_SLUGS.ADMIN) {
    can_manage_users = true;
  }
  if (target === ROLE_SLUGS.USER) {
    can_manage_users = false;
    // Users inherit platforms from their admin — not selected per account.
    allowed_platforms = uniqueStrings(actor?.allowed_platforms || []);
  }
  if (target === ROLE_SLUGS.SUPERADMIN) {
    can_manage_users = true;
    allowed_platforms = [];
  }

  return {
    allowed_pages,
    allowed_platforms,
    can_manage_users,
  };
};

const parseQuota = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
};

module.exports = {
  uniqueStrings,
  intersectAccess,
  resolveAccessForAssignee,
  parseQuota,
  PAGE_CATALOG,
};
