const express = require('express');
const authRoutes = require('./auth/auth.routes');
const userRoutes = require('./user/user.routes');
const roleRoutes = require('./role/role.routes');
const alertRoutes = require('./alerts/alert.routes');
const { grievanceRoutes } = require('./grievances');
const { eventRoutes, occasionCalendarRoutes } = require('./events');
const { authorize } = require('../middleware/auth.middleware');
const { getMyPermissions, getAllPages } = require('./user/user.controller');
const { ensureSystemRoles, getRoleBySlug } = require('./role/role.service');
const { ROLE_SLUGS } = require('./role/role.utils');
const { assertJwtConfigured, shouldSeedDefaultAdmin, isProduction } = require('../config/env');

/**
 * Flat router mounted at `/api`:
 *   auth: /login /logout /me
 *   + /me/permissions /pages /users /roles /alerts /grievances /events /occasion-calendar
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
router.use('/alerts', alertRoutes);
router.use('/grievances', grievanceRoutes);
router.use('/events', eventRoutes);
router.use('/occasion-calendar', occasionCalendarRoutes);
// Compat alias while UI migrates off /master-calendar
router.use('/master-calendar', occasionCalendarRoutes);

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
