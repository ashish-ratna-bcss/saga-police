const prisma = require('../../../prisma/client');
const { ROLE_SLUGS } = require('../role/role.utils');
const { getTenantPrisma } = require('../../lib/tenantDatabase.service');

/**
 * Quota owner for a tenant: the admin account (or self if actor is admin).
 */
const resolveQuotaOwner = async (actor) => {
  if (!actor?.id) return null;
  if (actor.role === ROLE_SLUGS.ADMIN) {
    return prisma.users.findUnique({ where: { id: actor.id } });
  }
  if (actor.role === ROLE_SLUGS.USER && actor.created_by) {
    return prisma.users.findUnique({ where: { id: actor.created_by } });
  }
  return null;
};

const assertUnderUserQuota = async (actor) => {
  const owner = await resolveQuotaOwner(actor);
  if (!owner || owner.max_users == null) return;
  const count = await prisma.users.count({
    where: {
      created_by: owner.id,
      roles: { slug: ROLE_SLUGS.USER },
    },
  });
  if (count >= owner.max_users) {
    const err = new Error(
      `User limit reached (${owner.max_users}). Ask Superadmin to raise max_users for this admin.`
    );
    err.status = 403;
    throw err;
  }
};

const assertUnderProfileQuota = async (actor, { db, adding = 1 } = {}) => {
  const owner = await resolveQuotaOwner(actor);
  if (!owner || owner.max_profiles == null) return;
  const tenant = db || (owner.db_name ? getTenantPrisma(owner.db_name) : null);
  if (!tenant) return;
  const count = await tenant.social_media_profiles.count();
  if (count + adding > owner.max_profiles) {
    const err = new Error(
      `Profile limit reached (${owner.max_profiles}). Ask Superadmin to raise max_profiles for this admin.`
    );
    err.status = 403;
    throw err;
  }
};

module.exports = {
  resolveQuotaOwner,
  assertUnderUserQuota,
  assertUnderProfileQuota,
};
