const prisma = require('../../../prisma/client');
const { ACCESS_FEATURES } = require('../auth/access_features');
const { ROLE_SLUGS } = require('./role.utils');
const { validateCreateRole, validateUpdateRole } = require('./role.validation');

const pagesFor = (role) => (ACCESS_FEATURES[role] || []).map((item) => item.path);

const SYSTEM_ROLE_DEFS = [
  {
    slug: ROLE_SLUGS.SUPERADMIN,
    name: 'Super Admin',
    allowed_pages: pagesFor('superadmin'),
    assignable_by: [ROLE_SLUGS.SUPERADMIN],
    can_manage_users: true,
    can_manage_roles: true,
    is_system: true,
  },
  {
    slug: ROLE_SLUGS.ADMIN,
    name: 'Admin',
    allowed_pages: pagesFor('admin'),
    assignable_by: [ROLE_SLUGS.SUPERADMIN],
    can_manage_users: true,
    can_manage_roles: false,
    is_system: true,
  },
  {
    slug: ROLE_SLUGS.USER,
    name: 'User',
    allowed_pages: pagesFor('user'),
    assignable_by: [ROLE_SLUGS.SUPERADMIN, ROLE_SLUGS.ADMIN],
    can_manage_users: false,
    can_manage_roles: false,
    is_system: true,
  },
];

const ensureSystemRoles = async () => {
  for (const def of SYSTEM_ROLE_DEFS) {
    await prisma.roles.upsert({
      where: { slug: def.slug },
      create: def,
      update: {
        name: def.name,
        allowed_pages: def.allowed_pages,
        assignable_by: def.assignable_by,
        can_manage_users: def.can_manage_users,
        can_manage_roles: def.can_manage_roles,
        is_system: true,
      },
    });
  }
};

const getRoleBySlug = async (slug) =>
  prisma.roles.findUnique({ where: { slug: String(slug).toLowerCase() } });

const listRoles = async () =>
  prisma.roles.findMany({ orderBy: [{ is_system: 'desc' }, { name: 'asc' }] });

// Roles the given actor role is allowed to hand out (e.g. in the "Add user" form).
// Superadmin always sees every role; everyone else sees only roles whose
// `assignable_by` list names their role slug.
const listAssignableRoles = async (actorSlug) => {
  const actor = String(actorSlug || '').toLowerCase();
  const roles = await listRoles();
  if (actor === ROLE_SLUGS.SUPERADMIN) return roles;
  return roles.filter((r) =>
    (r.assignable_by || []).map((s) => String(s).toLowerCase()).includes(actor)
  );
};

const createRole = async (body) => {
  const validated = validateCreateRole(body);
  if (!validated.ok) {
    const err = new Error(validated.message);
    err.status = validated.status;
    throw err;
  }
  const { name, slug, allowed_pages, assignable_by, can_manage_users } = validated.data;
  return prisma.roles.create({
    data: {
      name,
      slug,
      allowed_pages,
      assignable_by,
      can_manage_users,
      can_manage_roles: false,
      is_system: false,
    },
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
