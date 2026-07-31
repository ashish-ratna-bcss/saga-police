const PagePermission = require('../models/PagePermission');
const User = require('../models/User');
const { ALL_PAGES, PAGE_FEATURES } = require('../config/rbacConfig');

const PAGE_PATHS = new Set(ALL_PAGES.map((page) => page.path));
const FEATURE_IDS_BY_PAGE = Object.fromEntries(
  Object.entries(PAGE_FEATURES).map(([path, features]) => [path, new Set(features.map((feature) => feature.id))])
);

const normalizePath = (value) => {
  if (!value || typeof value !== 'string') return '/';
  const path = value.replace(/\/+$/, '') || '/';
  return path.startsWith('/') ? path : `/${path}`;
};

const uniqueStrings = (value) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry) => typeof entry === 'string'))];
};

const buildPermissionsFromAllowedPages = (allowedPages = []) => {
  const permissions = {};
  uniqueStrings(allowedPages).forEach((rawPath) => {
    const pagePath = normalizePath(rawPath);
    if (!PAGE_PATHS.has(pagePath)) return;
    const featureIds = PAGE_FEATURES[pagePath]?.map((feature) => feature.id) || [];
    permissions[pagePath] = { enabled: true, features: featureIds };
  });
  return permissions;
};

const buildDefaultPermissions = () => ({
  '/dashboard': { enabled: true, features: [] }
});

const buildSuperAdminPermissions = () => {
  const permissions = {};
  ALL_PAGES.forEach((page) => {
    permissions[page.path] = {
      enabled: true,
      features: PAGE_FEATURES[page.path]?.map((feature) => feature.id) || []
    };
  });
  return permissions;
};

const normalizePermissionsForRead = (rawPermissions = {}, { fillMissingFeatures = false } = {}) => {
  const permissions = {};
  Object.entries(rawPermissions || {}).forEach(([rawPagePath, rawPermission]) => {
    const pagePath = normalizePath(rawPagePath);
    if (!PAGE_PATHS.has(pagePath)) return;

    const enabled = Boolean(rawPermission?.enabled);
    const featureSet = FEATURE_IDS_BY_PAGE[pagePath];
    let features = uniqueStrings(rawPermission?.features);

    if (featureSet && featureSet.size > 0) {
      features = features.filter((featureId) => featureSet.has(featureId));
      if (enabled && fillMissingFeatures && features.length === 0) {
        features = [...featureSet];
      }
    } else {
      features = [];
    }

    permissions[pagePath] = { enabled, features };
  });
  return permissions;
};

const validateAndNormalizePermissions = (rawPermissions = {}) => {
  const sanitized = {};
  const errors = [];

  Object.entries(rawPermissions || {}).forEach(([rawPagePath, rawPermission]) => {
    const pagePath = normalizePath(rawPagePath);
    if (!PAGE_PATHS.has(pagePath)) {
      errors.push(`Invalid page path: ${rawPagePath}`);
      return;
    }

    if (!rawPermission || typeof rawPermission !== 'object') {
      errors.push(`Invalid permission object for ${pagePath}`);
      return;
    }

    const enabled = Boolean(rawPermission.enabled);
    const featureSet = FEATURE_IDS_BY_PAGE[pagePath];
    let features = uniqueStrings(rawPermission.features);

    if (featureSet && featureSet.size > 0) {
      const invalidFeatures = features.filter((featureId) => !featureSet.has(featureId));
      if (invalidFeatures.length > 0) {
        errors.push(`Invalid feature ids for ${pagePath}: ${invalidFeatures.join(', ')}`);
      }
      features = features.filter((featureId) => featureSet.has(featureId));
      if (enabled && features.length === 0) {
        errors.push(`At least one feature must be enabled for ${pagePath}`);
      }
    } else {
      if (features.length > 0) {
        errors.push(`Page ${pagePath} does not support feature-level permissions`);
      }
      features = [];
    }

    sanitized[pagePath] = { enabled, features };
  });

  return { sanitized, errors };
};

const enabledPagesFromPermissions = (permissions = {}) => (
  Object.entries(permissions)
    .filter(([, permission]) => permission?.enabled)
    .map(([pagePath]) => pagePath)
);

// @access  Private (superadmin only)
const getAllPages = async (req, res) => {
  try {
    const pagesWithFeatures = ALL_PAGES.map((page) => ({
      ...page,
      features: PAGE_FEATURES[page.path] || []
    }));
    res.json(pagesWithFeatures);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all users (for admin dropdown)
// @route   GET /api/rbac/users
// @access  Private (superadmin only)
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select('id email full_name role is_active')
      .sort({ full_name: 1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a user (admin flow)
// @route   POST /api/rbac/users
// @access  Private (superadmin only)
const createUser = async (req, res) => {
  try {
    const { full_name, email, password, role } = req.body;

    if (!full_name || !email || !password || !role) {
      return res.status(400).json({ message: 'Please add all fields' });
    }

    if (
      typeof full_name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof role !== 'string'
    ) {
      return res.status(400).json({ message: 'Invalid field types' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedName = full_name.trim();
    const normalizedRole = role.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
      return res.status(400).json({ message: 'Invalid email' });
    }

    if (password.length < 8 || password.length > 200) {
      return res.status(400).json({ message: 'Password must be 8–200 characters' });
    }

    if (normalizedName.length < 1 || normalizedName.length > 120) {
      return res.status(400).json({ message: 'Invalid full_name length' });
    }

    if (!['superadmin', 'level-1', 'level-2'].includes(normalizedRole)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      email: normalizedEmail,
      password: hashedPassword,
      full_name: normalizedName,
      role: normalizedRole,
    });

    return res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        created_at: user.created_at,
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Get permissions for a specific user
// @route   GET /api/rbac/permissions/:userId
// @access  Private (superadmin only)
const getUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({ id: userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const permissionDoc = await PagePermission.findOne({ user_id: userId });

    if (!permissionDoc) {
      const defaultPermissions = buildDefaultPermissions();
      return res.json({
        user_id: userId,
        allowed_pages: enabledPagesFromPermissions(defaultPermissions),
        permissions: defaultPermissions,
        has_custom_permissions: false
      });
    }

    const permissions = permissionDoc.permissions
      ? normalizePermissionsForRead(permissionDoc.permissions, { fillMissingFeatures: true })
      : buildPermissionsFromAllowedPages(permissionDoc.allowed_pages || []);

    res.json({
      user_id: userId,
      allowed_pages: enabledPagesFromPermissions(permissions),
      permissions,
      has_custom_permissions: true,
      updated_by: permissionDoc.updated_by,
      updated_at: permissionDoc.updated_at
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Set/update permissions for a specific user
// @route   PUT /api/rbac/permissions/:userId
// @access  Private (superadmin only)
const updateUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;

    if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
      return res.status(400).json({ message: 'permissions must be an object' });
    }

    const user = await User.findOne({ id: userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'superadmin') {
      return res.status(403).json({ message: 'Cannot modify superadmin permissions' });
    }

    const { sanitized, errors } = validateAndNormalizePermissions(permissions);
    if (errors.length > 0) {
      return res.status(400).json({
        message: 'Invalid permissions payload',
        errors
      });
    }

    const allowedPages = enabledPagesFromPermissions(sanitized);

    const permissionDoc = await PagePermission.findOneAndUpdate(
      { user_id: userId },
      {
        user_id: userId,
        allowed_pages: allowedPages,
        permissions: sanitized,
        updated_by: req.user.id,
        updated_at: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      message: 'Permissions updated successfully',
      user_id: userId,
      allowed_pages: permissionDoc.allowed_pages,
      permissions: permissionDoc.permissions,
      has_custom_permissions: true,
      updated_by: permissionDoc.updated_by,
      updated_at: permissionDoc.updated_at
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get permissions for the currently logged-in user
// @route   GET /api/rbac/my-permissions
// @access  Private
const getMyPermissions = async (req, res) => {
  try {
    if (req.user.role === 'superadmin') {
      const permissions = buildSuperAdminPermissions();
      return res.json({
        allowed_pages: enabledPagesFromPermissions(permissions),
        permissions,
        is_super_admin: true
      });
    }

    const permissionDoc = await PagePermission.findOne({ user_id: req.user.id });
    if (!permissionDoc) {
      const defaultPermissions = buildDefaultPermissions();
      return res.json({
        allowed_pages: enabledPagesFromPermissions(defaultPermissions),
        permissions: defaultPermissions,
        has_custom_permissions: false
      });
    }

    let permissions = permissionDoc.permissions
      ? normalizePermissionsForRead(permissionDoc.permissions, { fillMissingFeatures: true })
      : buildPermissionsFromAllowedPages(permissionDoc.allowed_pages || []);

    if (Object.keys(permissions).length === 0) {
      permissions = buildDefaultPermissions();
    }

    res.json({
      allowed_pages: enabledPagesFromPermissions(permissions),
      permissions,
      has_custom_permissions: true
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user details (name, email, role, password)
// @route   PUT /api/rbac/users/:userId
// @access  Private (superadmin only)
const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { full_name, email, role, password } = req.body;

    const user = await User.findOne({ id: userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent downgrading the last superadmin (basic safeguard)
    if (user.role === 'superadmin' && role !== 'superadmin') {
      const superAdminCount = await User.countDocuments({ role: 'superadmin' });
      if (superAdminCount <= 1) {
        return res.status(400).json({ message: 'Cannot change the role of the last superadmin' });
      }
    }

    user.full_name = full_name || user.full_name;
    user.email = email || user.email;
    user.role = role || user.role;

    // Only update password if provided
    if (password && password.trim() !== '') {
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }

    await user.save();

    res.json({
      message: 'User updated successfully',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role
      }
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a user
// @route   DELETE /api/rbac/users/:userId
// @access  Private (superadmin only)
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({ id: userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'superadmin') {
      const superAdminCount = await User.countDocuments({ role: 'superadmin' });
      if (superAdminCount <= 1) {
        return res.status(400).json({ message: 'Cannot delete the last superadmin' });
      }
    }

    // Prevent self-deletion
    if (user.id === req.user.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    await User.findOneAndDelete({ id: userId });

    // Cleanup related permissions
    await PagePermission.findOneAndDelete({ user_id: userId });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


module.exports = {
  createUser,
  getAllPages,
  getAllUsers,
  getUserPermissions,
  updateUserPermissions,
  getMyPermissions,
  updateUser,
  deleteUser,
  ALL_PAGES,
  PAGE_FEATURES
};
