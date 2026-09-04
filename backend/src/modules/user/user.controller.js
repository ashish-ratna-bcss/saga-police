const {
  listUsers,
  createUserAccount,
  updateUserAccount,
  deleteUserAccount,
} = require('./user.service');
const { ACCESS_FEATURES } = require('../auth/access_features');

const uniquePages = () => {
  const byPath = new Map();
  for (const items of Object.values(ACCESS_FEATURES)) {
    for (const item of items) {
      if (!byPath.has(item.path)) byPath.set(item.path, item);
    }
  }
  return [...byPath.values()];
};

const getMyPermissions = async (req, res) => {
  try {
    const allowed_pages = req.user.allowed_pages || [];
    return res.json({
      allowed_pages,
      is_super_admin: req.user.role === 'superadmin',
      can_manage_users: Boolean(req.user.can_manage_users),
      can_manage_roles: Boolean(req.user.can_manage_roles),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getAllPages = async (req, res) => {
  try {
    return res.json(uniquePages());
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await listUsers();
    return res.json(users);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const createUser = async (req, res) => {
  try {
    const user = await createUserAccount(req.user, req.body || {});
    return res.status(201).json({ message: 'User created successfully', user });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const user = await updateUserAccount(req.user, req.params.id, req.body || {});
    return res.json({ message: 'User updated successfully', user });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    await deleteUserAccount(req.user, req.params.id);
    return res.json({ message: 'User deleted successfully' });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const getUserPermissions = async (req, res) => {
  try {
    const prisma = require('../../../prisma/client');
    const user = await prisma.users.findUnique({
      where: { id: Number(req.params.id) },
      include: { roles: true },
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({
      user_id: user.id,
      role: user.roles?.slug,
      allowed_pages: user.roles?.allowed_pages || [],
      has_custom_permissions: false,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateUserPermissions = async (req, res) =>
  res.status(400).json({
    message:
      'Per-user page permissions are deprecated. Update the role via PUT /api/roles/:id instead.',
  });

module.exports = {
  getMyPermissions,
  getAllPages,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserPermissions,
  updateUserPermissions,
};
