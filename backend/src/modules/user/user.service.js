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
const { parseLogoInput } = require('./user.logo');
const {
  buildApplicationDetails,
  readApplicationDetails,
  themeOnly,
  parsePort,
} = require('./user.application');

const USER_LIST_SELECT = {
  id: true,
  name: true,
  username: true,
  email: true,
  role_id: true,
  created_by: true,
  db_name: true,
  allowed_pages: true,
  allowed_platforms: true,
  can_manage_users: true,
  can_manage_roles: true,
  max_profiles: true,
  max_users: true,
  ui_mode: true,
  theme_color: true,
  application_details: true,
  port: true,
  logo_mime: true,
  created_at: true,
  updated_at: true,
  roles: true,
};

const applyLogoFields = (data, bodyLogo) => {
  const parsed = parseLogoInput(bodyLogo);
  if (parsed.kind === 'binary') {
    data.logo_data = parsed.buffer;
    data.logo_mime = parsed.mime;
    return { ok: true };
  }
  if (parsed.kind === 'legacy_path' || parsed.kind === 'unchanged') {
    return { ok: true };
  }
  if (parsed.kind === 'empty') {
    if (bodyLogo === '') {
      data.logo_data = null;
      data.logo_mime = null;
    }
    return { ok: true };
  }
  return { ok: false, message: parsed.message || 'Invalid logo' };
};

const assertPortAvailable = async (port, excludeUserId = null) => {
  if (port == null) return;
  const existing = await prisma.users.findFirst({
    where: {
      port,
      ...(excludeUserId ? { id: { not: Number(excludeUserId) } } : {}),
    },
    select: { id: true, username: true },
  });
  if (existing) {
    const err = new Error(`Port ${port} is already used by ${existing.username}`);
    err.status = 400;
    throw err;
  }
};

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
    select: USER_LIST_SELECT,
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
  const actorApp = readApplicationDetails(actorUser || {});
  const creatorColor =
    (typeof actorUser?.theme_color === 'object' && actorUser?.theme_color?.value) ||
    actor?.theme_color ||
    'linear-gradient(135deg, #0f172a 0%, #38bdf8 100%)';

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

  const createData = {
    name,
    username,
    email,
    password: hashedPassword,
    role_id: assignedRole.id,
    created_by: actor.id,
    db_name: assignedDbName,
    ui_mode: 'light',
    theme_color: themeOnly(actorUser?.theme_color, body.theme_color || creatorColor),
    ...access,
    ...quotaData,
  };

  // Admin tenants get application_details + port; child users inherit creator branding
  if (assignedRole.slug === ROLE_SLUGS.ADMIN) {
    const port = parsePort(body.port);
    if (port == null) {
      const err = new Error('Admin accounts require a frontend port (e.g. 3000)');
      err.status = 400;
      throw err;
    }
    await assertPortAvailable(port);
    createData.port = port;
    createData.application_details = buildApplicationDetails(null, body, {
      title: body.blurasagatitle || 'BLURA SAGA',
      description: body.blurasagadescription || 'Cyber Intelligence Platform',
    });
  } else {
    createData.port = null;
    createData.application_details = buildApplicationDetails(
      actorUser?.application_details,
      {},
      actorApp
    );
  }

  const logoResult = applyLogoFields(createData, body.blurasagalogo);
  if (!logoResult.ok) {
    const err = new Error(logoResult.message);
    err.status = 400;
    throw err;
  }

  // Child users inherit the admin org logo unless a new image was uploaded.
  // Frontend often sends the admin's /api/branding/logo?… URL (unchanged) — that must
  // NOT block inheritance (previously only ran when blurasagalogo was undefined).
  const logoParsed = parseLogoInput(body.blurasagalogo);
  if (
    !createData.logo_data &&
    logoParsed.kind !== 'binary' &&
    actorUser?.logo_data &&
    actorUser?.logo_mime
  ) {
    createData.logo_data = actorUser.logo_data;
    createData.logo_mime = actorUser.logo_mime;
  }

  const { provisionAdminDatabase } = require('../../lib/tenantDatabase.service');

  let user = await prisma.users.create({
    data: createData,
    include: { roles: true },
  });

  if (assignedRole.slug === ROLE_SLUGS.ADMIN) {
    try {
      const titleFromApp = createData.application_details?.title || 'BLURA SAGA';
      const adminDbName = await provisionAdminDatabase(user.id, {
        username: user.username,
        blurasagatitle: titleFromApp,
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
    body.application_name !== undefined ||
    body.domains !== undefined ||
    body.domain !== undefined ||
    body.port !== undefined ||
    body.blurasagalogo !== undefined ||
    body.theme_color !== undefined
  ) {
    if (body.blurasagalogo !== undefined) {
      const logoResult = applyLogoFields(data, body.blurasagalogo);
      if (!logoResult.ok) {
        const err = new Error(logoResult.message);
        err.status = 400;
        throw err;
      }
    }

    if (body.theme_color !== undefined) {
      data.theme_color = themeOnly(user.theme_color, body.theme_color);
    }

    const brandingTouched =
      body.blurasagatitle !== undefined ||
      body.blurasagadescription !== undefined ||
      body.application_name !== undefined ||
      body.domains !== undefined ||
      body.domain !== undefined;

    if (brandingTouched) {
      data.application_details = buildApplicationDetails(
        user.application_details,
        body,
        readApplicationDetails(user)
      );
    }

    if (body.port !== undefined) {
      const port = parsePort(body.port);
      if (body.port !== null && body.port !== '' && port == null) {
        const err = new Error('Invalid port number');
        err.status = 400;
        throw err;
      }
      await assertPortAvailable(port, user.id);
      data.port = port;
    }
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
