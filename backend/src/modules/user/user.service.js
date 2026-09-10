const bcrypt = require('bcryptjs');
const prisma = require('../../../prisma/client');
const { getRoleBySlug } = require('../role/role.service');
const { canAssignRole, ROLE_SLUGS } = require('../role/role.utils');
const { toPublicUser } = require('./user.utils');
const { resolveAccessForAssignee, parseQuota } = require('./user.access');
const { assertUnderUserQuota } = require('./user.quotas');
const {
  DEFAULT_ADMIN_MAX_PROFILES,
  DEFAULT_ADMIN_MAX_USERS,
} = require('../auth/access_features');
const { validateCreateUser, validateUpdateUser } = require('./user.validation');

const listUsers = async (actor) => {
  const isSuperadmin = actor?.role === ROLE_SLUGS.SUPERADMIN;
  const isAdmin = actor?.role === ROLE_SLUGS.ADMIN;

  let where = {};
  if (isSuperadmin) {
    // Superadmin manages Admins only (not end-users or other superadmins).
    where = { roles: { slug: ROLE_SLUGS.ADMIN } };
  } else if (isAdmin) {
    where = {
      created_by: actor?.id,
      roles: { slug: ROLE_SLUGS.USER },
    };
  } else {
    where = { created_by: actor?.id };
  }

  const users = await prisma.users.findMany({
    where,
    include: { roles: true },
    orderBy: { name: 'asc' },
  });
  return users.map((u) => toPublicUser(u, u.roles));
};

const assertOwnsUser = (actor, user) => {
  if (actor.role === ROLE_SLUGS.SUPERADMIN) {
    // Superadmin only manages Admin accounts (not end-users).
    if (
      user.roles?.slug &&
      user.roles.slug !== ROLE_SLUGS.ADMIN &&
      user.id !== actor.id
    ) {
      const err = new Error('Superadmin can only manage Admin accounts');
      err.status = 403;
      throw err;
    }
    return;
  }
  if (user.created_by !== actor.id) {
    const err = new Error('You can only manage users you created');
    err.status = 403;
    throw err;
  }
};

const resolveAssignableRole = async (actorSlug, targetSlug) => {
  const role = await getRoleBySlug(targetSlug);
  if (!role || !canAssignRole(actorSlug, role)) {
    const err = new Error(`You cannot assign role "${targetSlug}"`);
    err.status = 403;
    throw err;
  }
  return role;
};

const createUserAccount = async (actor, body) => {
  if (!actor?.can_manage_users) {
    const err = new Error('Not allowed to manage users');
    err.status = 403;
    throw err;
  }
  const validated = validateCreateUser(body);
  if (!validated.ok) {
    const err = new Error(validated.message);
    err.status = validated.status;
    throw err;
  }
  const { name, email, username, password, role: roleSlug } = validated.data;

  // Scope: superadmin creates admins; admin creates users.
  if (actor.role === ROLE_SLUGS.SUPERADMIN && roleSlug !== ROLE_SLUGS.ADMIN) {
    const err = new Error('Superadmin can only create Admin accounts');
    err.status = 400;
    throw err;
  }
  if (actor.role === ROLE_SLUGS.ADMIN && roleSlug !== ROLE_SLUGS.USER) {
    const err = new Error('Admin can only create User accounts');
    err.status = 400;
    throw err;
  }

  const assignedRole = await resolveAssignableRole(actor.role, roleSlug);
  const exists = await prisma.users.findFirst({ where: { OR: [{ email }, { username }] } });
  if (exists) {
    const err = new Error('User already exists');
    err.status = 400;
    throw err;
  }

  if (assignedRole.slug === ROLE_SLUGS.USER) {
    await assertUnderUserQuota(actor);
  }

  const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10));

  let actorUser = null;
  if (actor?.id) {
    actorUser = await prisma.users.findUnique({ where: { id: actor.id } });
  }
  const actorTc =
    actorUser && typeof actorUser.theme_color === 'object' && actorUser.theme_color
      ? actorUser.theme_color
      : {};

  const creatorTitle = actorTc.blurasagatitle || actor?.blurasagatitle || 'BLURA SAGA';
  const creatorDesc =
    actorTc.blurasagadescription || actor?.blurasagadescription || 'Cyber Intelligence Platform';
  const creatorLogo = actorTc.blurasagalogo || actor?.blurasagalogo || '/blura_saga_logo.jpg';
  const creatorColor =
    actorTc.value || actor?.theme_color || 'linear-gradient(135deg, #0f172a 0%, #38bdf8 100%)';

  const themePayload = {
    blurasagatitle: body.blurasagatitle || creatorTitle,
    blurasagadescription: body.blurasagadescription || creatorDesc,
    blurasagalogo: body.blurasagalogo || creatorLogo,
    value: body.theme_color || creatorColor,
    primary_hex: '#38bdf8',
  };

  const { provisionAdminDatabase } = require('../../lib/tenantDatabase.service');

  let assignedDbName = null;
  if (assignedRole.slug === ROLE_SLUGS.USER) {
    assignedDbName = actorUser?.db_name || actor?.db_name || null;
  }

  const access = resolveAccessForAssignee(actor, assignedRole.slug, body);

  const quotaData = {};
  if (assignedRole.slug === ROLE_SLUGS.ADMIN) {
    quotaData.max_profiles = parseQuota(body.max_profiles, DEFAULT_ADMIN_MAX_PROFILES);
    quotaData.max_users = parseQuota(body.max_users, DEFAULT_ADMIN_MAX_USERS);
  }

  let user = await prisma.users.create({
    data: {
      name,
      username,
      email,
      password: hashedPassword,
      role_id: assignedRole.id,
      created_by: actor.id,
      db_name: assignedDbName,
      ui_mode: 'light',
      theme_color: themePayload,
      ...access,
      ...quotaData,
    },
    include: { roles: true },
  });

  if (assignedRole.slug === ROLE_SLUGS.ADMIN) {
    try {
      const titleFromTheme =
        themePayload.blurasagatitle ||
        (typeof themePayload === 'object' ? themePayload.blurasagatitle : null);
      const adminDbName = await provisionAdminDatabase(user.id, {
        username: user.username,
        blurasagatitle: titleFromTheme || 'BLURA SAGA',
      });
      user = await prisma.users.update({
        where: { id: user.id },
        data: { db_name: adminDbName },
        include: { roles: true },
      });
    } catch (provisionErr) {
      await prisma.users.delete({ where: { id: user.id } }).catch(() => {});
      throw provisionErr;
    }
  }

  return toPublicUser(user, user.roles);
};

const updateUserAccount = async (actor, userId, body) => {
  if (!actor?.can_manage_users) {
    const err = new Error('Not allowed to manage users');
    err.status = 403;
    throw err;
  }
  const user = await prisma.users.findUnique({
    where: { id: Number(userId) },
    include: { roles: true },
  });
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  assertOwnsUser(actor, user);

  const validated = validateUpdateUser(body);
  if (!validated.ok) {
    const err = new Error(validated.message);
    err.status = validated.status;
    throw err;
  }
  const data = { ...validated.data };
  let nextRoleSlug = user.roles?.slug;
  if (data.role) {
    if (
      user.roles?.slug === ROLE_SLUGS.SUPERADMIN &&
      data.role !== ROLE_SLUGS.SUPERADMIN
    ) {
      const count = await prisma.users.count({
        where: { roles: { slug: ROLE_SLUGS.SUPERADMIN } },
      });
      if (count <= 1) {
        const err = new Error('Cannot change the role of the last superadmin');
        err.status = 400;
        throw err;
      }
    }
    const nextRole = await resolveAssignableRole(actor.role, data.role);
    nextRoleSlug = nextRole.slug;
    data.role_id = nextRole.id;
    delete data.role;
  }
  if (data.password) {
    data.password = await bcrypt.hash(data.password, await bcrypt.genSalt(10));
  }

  if (
    body.blurasagatitle !== undefined ||
    body.blurasagadescription !== undefined ||
    body.blurasagalogo !== undefined ||
    body.theme_color !== undefined
  ) {
    const existingTheme =
      typeof user.theme_color === 'object' && user.theme_color ? user.theme_color : {};
    data.theme_color = {
      ...existingTheme,
      blurasagatitle:
        body.blurasagatitle !== undefined
          ? body.blurasagatitle
          : existingTheme.blurasagatitle || 'BLURA SAGA',
      blurasagadescription:
        body.blurasagadescription !== undefined
          ? body.blurasagadescription
          : existingTheme.blurasagadescription || 'Cyber Intelligence Platform',
      blurasagalogo:
        body.blurasagalogo !== undefined
          ? body.blurasagalogo
          : existingTheme.blurasagalogo || '/blura_saga_logo.jpg',
      value:
        body.theme_color ||
        existingTheme.value ||
        'linear-gradient(135deg, #0f172a 0%, #38bdf8 100%)',
    };
  }

  // Optional access fields on user update (preserve platforms when omitted)
  if (
    Array.isArray(body.allowed_pages) ||
    Array.isArray(body.allowed_platforms) ||
    typeof body.can_manage_users === 'boolean'
  ) {
    Object.assign(
      data,
      resolveAccessForAssignee(actor, nextRoleSlug, {
        allowed_pages: Array.isArray(body.allowed_pages)
          ? body.allowed_pages
          : user.allowed_pages,
        allowed_platforms: Array.isArray(body.allowed_platforms)
          ? body.allowed_platforms
          : user.allowed_platforms,
        can_manage_users:
          typeof body.can_manage_users === 'boolean'
            ? body.can_manage_users
            : user.can_manage_users,
      })
    );
  }

  if (actor.role === ROLE_SLUGS.SUPERADMIN && user.roles?.slug === ROLE_SLUGS.ADMIN) {
    if (body.max_profiles !== undefined) {
      data.max_profiles = parseQuota(body.max_profiles, user.max_profiles);
    }
    if (body.max_users !== undefined) {
      data.max_users = parseQuota(body.max_users, user.max_users);
    }
  }

  const updated = await prisma.users.update({
    where: { id: user.id },
    data,
    include: { roles: true },
  });
  return toPublicUser(updated, updated.roles);
};

const deleteUserAccount = async (actor, userId) => {
  if (!actor?.can_manage_users) {
    const err = new Error('Not allowed to manage users');
    err.status = 403;
    throw err;
  }
  const id = Number(userId);
  if (id === actor.id) {
    const err = new Error('Cannot delete your own account');
    err.status = 400;
    throw err;
  }
  const user = await prisma.users.findUnique({
    where: { id },
    include: { roles: true },
  });
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  if (user.roles?.slug === ROLE_SLUGS.SUPERADMIN) {
    const count = await prisma.users.count({
      where: { roles: { slug: ROLE_SLUGS.SUPERADMIN } },
    });
    if (count <= 1) {
      const err = new Error('Cannot delete the last superadmin');
      err.status = 400;
      throw err;
    }
  }
  if (actor.role === ROLE_SLUGS.ADMIN && user.roles?.slug !== ROLE_SLUGS.USER) {
    const err = new Error('Admin can only delete user accounts');
    err.status = 403;
    throw err;
  }
  assertOwnsUser(actor, user);
  await prisma.users.delete({ where: { id } });
  return true;
};

const getUserAccess = async (actor, userId) => {
  if (!actor?.can_manage_users && Number(userId) !== actor?.id) {
    const err = new Error('Not allowed to view permissions');
    err.status = 403;
    throw err;
  }
  const user = await prisma.users.findUnique({
    where: { id: Number(userId) },
    include: { roles: true },
  });
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  if (Number(userId) !== actor.id) {
    assertOwnsUser(actor, user);
  }
  return {
    user_id: user.id,
    role: user.roles?.slug ?? null,
    allowed_pages: user.allowed_pages || [],
    allowed_platforms: user.allowed_platforms || [],
    can_manage_users: Boolean(user.can_manage_users),
    max_profiles: user.max_profiles ?? null,
    max_users: user.max_users ?? null,
    has_custom_permissions: true,
  };
};

const updateUserAccess = async (actor, userId, body) => {
  if (!actor?.can_manage_users) {
    const err = new Error('Not allowed to manage users');
    err.status = 403;
    throw err;
  }
  const user = await prisma.users.findUnique({
    where: { id: Number(userId) },
    include: { roles: true },
  });
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  assertOwnsUser(actor, user);

  const access = resolveAccessForAssignee(actor, user.roles?.slug, {
    allowed_pages: body.allowed_pages ?? user.allowed_pages,
    allowed_platforms: Array.isArray(body.allowed_platforms)
      ? body.allowed_platforms
      : user.allowed_platforms,
    can_manage_users:
      typeof body.can_manage_users === 'boolean' ? body.can_manage_users : user.can_manage_users,
  });

  const data = { ...access };
  if (actor.role === ROLE_SLUGS.SUPERADMIN && user.roles?.slug === ROLE_SLUGS.ADMIN) {
    if (body.max_profiles !== undefined) {
      data.max_profiles = parseQuota(body.max_profiles, user.max_profiles);
    }
    if (body.max_users !== undefined) {
      data.max_users = parseQuota(body.max_users, user.max_users);
    }
  }

  const updated = await prisma.users.update({
    where: { id: user.id },
    data,
    include: { roles: true },
  });
  return toPublicUser(updated, updated.roles);
};

const getAdminConsoleStats = async (actor) => {
  if (actor?.role !== ROLE_SLUGS.SUPERADMIN) {
    const err = new Error('Superadmin only');
    err.status = 403;
    throw err;
  }
  const { getTenantPrisma } = require('../../lib/tenantDatabase.service');
  const admins = await prisma.users.findMany({
    where: { roles: { slug: ROLE_SLUGS.ADMIN } },
    include: { roles: true },
    orderBy: { name: 'asc' },
  });

  const rows = [];
  for (const admin of admins) {
    const usersCount = await prisma.users.count({
      where: { created_by: admin.id, roles: { slug: ROLE_SLUGS.USER } },
    });
    let profilesCount = 0;
    if (admin.db_name) {
      try {
        profilesCount = await getTenantPrisma(admin.db_name).social_media_profiles.count();
      } catch {
        profilesCount = 0;
      }
    }
    rows.push({
      ...toPublicUser(admin, admin.roles),
      users_count: usersCount,
      profiles_count: profilesCount,
    });
  }

  return {
    admins_total: rows.length,
    admins: rows,
  };
};

module.exports = {
  listUsers,
  createUserAccount,
  updateUserAccount,
  deleteUserAccount,
  getUserAccess,
  updateUserAccess,
  getAdminConsoleStats,
};
