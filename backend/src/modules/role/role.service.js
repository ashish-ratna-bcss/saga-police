const prisma = require('../../../prisma/client');
const { ROLE_SLUGS, canAssignRole } = require('./role.utils');
const { validateCreateRole, validateUpdateRole } = require('./role.validation');

const SYSTEM_ROLE_DEFS = [
  { slug: ROLE_SLUGS.SUPERADMIN, name: 'Super Admin', is_system: true },
  { slug: ROLE_SLUGS.ADMIN, name: 'Admin', is_system: true },
  { slug: ROLE_SLUGS.USER, name: 'User', is_system: true },
];

/** Always upsert system roles (superadmin / admin / user). */
const ensureSystemRoles = async () => {
  for (const def of SYSTEM_ROLE_DEFS) {
    await prisma.roles.upsert({
      where: { slug: def.slug },
      create: def,
      update: {
        name: def.name,
        is_system: true,
      },
    });
  }
};

const getRoleBySlug = async (slug) =>
  prisma.roles.findUnique({ where: { slug: String(slug).toLowerCase() } });

const listRoles = async () =>
  prisma.roles.findMany({ orderBy: [{ is_system: 'desc' }, { name: 'asc' }] });

const listAssignableRoles = async (actorSlug) => {
  const roles = await listRoles();
  return roles.filter((r) => canAssignRole(actorSlug, r));
};

const createRole = async (body) => {
  const validated = validateCreateRole(body);
  if (!validated.ok) {
    const err = new Error(validated.message);
    err.status = validated.status;
    throw err;
  }
  const { name, slug } = validated.data;
  return prisma.roles.create({
    data: { name, slug, is_system: false },
  });
};

const updateRole = async (id, body) => {
  const role = await prisma.roles.findUnique({ where: { id: Number(id) } });
  if (!role) {
    const err = new Error('Role not found');
    err.status = 404;
    throw err;
  }
  const validated = validateUpdateRole(body, role);
  if (!validated.ok) {
    const err = new Error(validated.message);
    err.status = validated.status;
    throw err;
  }
  return prisma.roles.update({ where: { id: role.id }, data: validated.data });
};

const deleteRole = async (id) => {
  const role = await prisma.roles.findUnique({ where: { id: Number(id) } });
  if (!role) {
    const err = new Error('Role not found');
    err.status = 404;
    throw err;
  }
  if (role.is_system) {
    const err = new Error('Cannot delete a system role');
    err.status = 400;
    throw err;
  }
  const usersCount = await prisma.users.count({ where: { role_id: role.id } });
  if (usersCount > 0) {
    const err = new Error('Cannot delete a role that is still assigned to users');
    err.status = 400;
    throw err;
  }
  await prisma.roles.delete({ where: { id: role.id } });
  return true;
};

module.exports = {
  ensureSystemRoles,
  getRoleBySlug,
  listRoles,
  listAssignableRoles,
  createRole,
  updateRole,
  deleteRole,
};
