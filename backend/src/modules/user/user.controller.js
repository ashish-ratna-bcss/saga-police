const {
  listUsers,
  createUserAccount,
  updateUserAccount,
  deleteUserAccount,
  getUserAccess,
  updateUserAccess,
} = require('./user.service');
const { PAGE_CATALOG, PLATFORM_CATALOG, grantablePagesForTarget } = require('../auth/access_features');

const getMyPermissions = async (req, res) => {
  try {
    return res.json({
      allowed_pages: req.user.allowed_pages || [],
      allowed_platforms: req.user.allowed_platforms || [],
      is_super_admin: req.user.role === 'superadmin',
      can_manage_users: Boolean(req.user.can_manage_users),
      max_profiles: req.user.max_profiles ?? null,
      max_users: req.user.max_users ?? null,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getAllPages = async (req, res) => {
  try {
    const forRole = String(req.query.for || '').toLowerCase();
    const pages = forRole
      ? grantablePagesForTarget(req.user, forRole)
      : PAGE_CATALOG;
    return res.json({
      pages,
      platforms: PLATFORM_CATALOG,
      for: forRole || null,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await listUsers(req.user);
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
    const data = await getUserAccess(req.user, req.params.id);
    return res.json(data);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const updateUserPermissions = async (req, res) => {
  try {
    const user = await updateUserAccess(req.user, req.params.id, req.body || {});
    return res.json({ message: 'Permissions updated', user });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

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
