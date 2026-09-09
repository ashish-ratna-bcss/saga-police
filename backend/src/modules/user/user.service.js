const bcrypt = require('bcryptjs');
const prisma = require('../../../prisma/client');
const { canAssignRole, ROLE_SLUGS } = require('../role/role.utils');
const { getRoleBySlug } = require('../role/role.service');
const { toPublicUser } = require('./user.utils');
const { validateCreateUser, validateUpdateUser } = require('./user.validation');

// Superadmin sees every account; admin sees only standard user accounts; others see accounts they created.
const listUsers = async (actor) => {
  const isSuperadmin = actor?.role === ROLE_SLUGS.SUPERADMIN;
  const isAdmin = actor?.role === ROLE_SLUGS.ADMIN;

  let where = {};
  if (isSuperadmin) {
    where = {};
  } else if (isAdmin) {
    where = {
      created_by: actor?.id,
      roles: { slug: { notIn: [ROLE_SLUGS.SUPERADMIN, ROLE_SLUGS.ADMIN] } },
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
  if (actor.role === ROLE_SLUGS.SUPERADMIN) return;
  if (user.created_by !== actor.id) {
    const err = new Error('You can only manage users you created');
    err.status = 403;
    throw err;
  }
};

// Looks up the target role and checks the actor may assign it, in one step —
// callers get back the resolved role record to use for the write.
const resolveAssignableRole = async (actorSlug, targetSlug) => {
  const role = await getRoleBySlug(targetSlug);
  if (!role) {
    const err = new Error('Invalid role');
    err.status = 400;
    throw err;
  }
  if (!canAssignRole(actorSlug, role)) {
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
  const role = await resolveAssignableRole(actor.role, roleSlug);
  const exists = await prisma.users.findFirst({ where: { OR: [{ email }, { username }] } });
  if (exists) {
    const err = new Error('User already exists');
    err.status = 400;
    throw err;
  }

  const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10));

  // Inherit creator's blurasaga details if not provided
  let actorUser = null;
  if (actor?.id) {
    actorUser = await prisma.users.findUnique({ where: { id: actor.id } });
  }
  const actorTc = actorUser && typeof actorUser.theme_color === 'object' && actorUser.theme_color ? actorUser.theme_color : {};

  const creatorTitle = actorTc.blurasagatitle || actor?.blurasagatitle || 'BLURA SAGA';
  const creatorDesc = actorTc.blurasagadescription || actor?.blurasagadescription || 'Cyber Intelligence Platform';
  const creatorLogo = actorTc.blurasagalogo || actor?.blurasagalogo || '/blura_saga_logo.jpg';
  const creatorColor = actorTc.value || actor?.theme_color || 'linear-gradient(135deg, #0f172a 0%, #38bdf8 100%)';

  const themePayload = {
    blurasagatitle: body.blurasagatitle || creatorTitle,
    blurasagadescription: body.blurasagadescription || creatorDesc,
    blurasagalogo: body.blurasagalogo || creatorLogo,
    value: body.theme_color || creatorColor,
    primary_hex: '#38bdf8',
  };

  const user = await prisma.users.create({
    data: {
      name,
      username,
      email,
      password: hashedPassword,
      role_id: role.id,
      created_by: actor.id,
      ui_mode: 'light',
      theme_color: themePayload,
    },
    include: { roles: true },
  });
  return toPublicUser(user, user.roles);
};

const updateUserAccount = async (actor, userId, body) => {
  if (!actor?.can_manage_users) {
    const err = new Error('Not allowed to manage users');
    err.status = 403;
    throw err;
  }
  const user = await prisma.users.findUnique({ where: { id: Number(userId) }, include: { roles: true } });
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  const validated = validateUpdateUser(body);
  if (!validated.ok) {
    const err = new Error(validated.message);
    err.status = validated.status;
    throw err;
  }
  const data = { ...validated.data };
  if (data.role) {
    if (user.roles?.slug === ROLE_SLUGS.SUPERADMIN && data.role !== ROLE_SLUGS.SUPERADMIN) {
      const count = await prisma.users.count({ where: { roles: { slug: ROLE_SLUGS.SUPERADMIN } } });
      if (count <= 1) {
        const err = new Error('Cannot change the role of the last superadmin');
        err.status = 400;
        throw err;
      }
    }
    const role = await resolveAssignableRole(actor.role, data.role);
    data.role_id = role.id;
    delete data.role;
  }
  if (data.password) {
    data.password = await bcrypt.hash(data.password, await bcrypt.genSalt(10));
  }

  // Handle blurasaga title, description, and logo fields update
  if (body.blurasagatitle !== undefined || body.blurasagadescription !== undefined || body.blurasagalogo !== undefined || body.theme_color !== undefined) {
    const existingTheme = typeof user.theme_color === 'object' && user.theme_color ? user.theme_color : {};
    data.theme_color = {
      ...existingTheme,
      blurasagatitle: body.blurasagatitle !== undefined ? body.blurasagatitle : (existingTheme.blurasagatitle || 'BLURA SAGA'),
      blurasagadescription: body.blurasagadescription !== undefined ? body.blurasagadescription : (existingTheme.blurasagadescription || 'Cyber Intelligence Platform'),
      blurasagalogo: body.blurasagalogo !== undefined ? body.blurasagalogo : (existingTheme.blurasagalogo || '/blura_saga_logo.jpg'),
      value: body.theme_color || existingTheme.value || 'linear-gradient(135deg, #0f172a 0%, #38bdf8 100%)',
    };
  }

  const updated = await prisma.users.update({ where: { id: user.id }, data, include: { roles: true } });
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
  const user = await prisma.users.findUnique({ where: { id }, include: { roles: true } });
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  if (user.roles?.slug === ROLE_SLUGS.SUPERADMIN) {
    const count = await prisma.users.count({ where: { roles: { slug: ROLE_SLUGS.SUPERADMIN } } });
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
  await prisma.users.delete({ where: { id } });
  return true;
};

module.exports = { listUsers, createUserAccount, updateUserAccount, deleteUserAccount };
