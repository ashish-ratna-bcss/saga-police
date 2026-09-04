const express = require('express');
const authRoutes = require('./auth/auth.routes');
const userRoutes = require('./user/user.routes');
const roleRoutes = require('./role/role.routes');
const { authorize } = require('../middleware/auth.middleware');
const { getMyPermissions, getAllPages } = require('./user/user.controller');
const { ensureSystemRoles, getRoleBySlug } = require('./role/role.service');
const { ROLE_SLUGS } = require('./role/role.utils');
const { assertJwtConfigured, shouldSeedDefaultAdmin, isProduction } = require('../config/env');

/**
 * Flat router mounted at `/api`:
 *   auth: /login /logout /me
 *   + /me/permissions /pages /users /roles
 */
const router = express.Router();

router.use(authRoutes);

router.get('/me/permissions', authorize(), getMyPermissions);
router.get(
  '/pages',
  authorize({ manageUsers: true }),
  getAllPages
);

router.use('/users', userRoutes);
router.use('/roles', roleRoutes);

module.exports = {
  router,
  authorize,
  ensureSystemRoles,
  getRoleBySlug,
  ROLE_SLUGS,
  assertJwtConfigured,
  shouldSeedDefaultAdmin,
  isProduction,
};
