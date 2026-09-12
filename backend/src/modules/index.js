const express = require('express');
const authRoutes = require('./auth/auth.routes');
const userRoutes = require('./user/user.routes');
const alertRoutes = require('./alerts/alert.routes');
const { keywordRoutes } = require('./alerts');
const {
  grievanceRoutes,
  grievanceWorkflowRoutes,
  suggestionRoutes,
  criticismRoutes,
  queryRoutes,
} = require('./grievances');
const { eventRoutes, occasionCalendarRoutes } = require('./events');
const { dashboardRoutes } = require('./dashboard');
const { healthRoutes } = require('./health');
const { socialProfileRoutes } = require('./social-profiles');
const { intelligenceRoutes } = require('./intelligence');
const {
  settingsRoutes,
  policyRoutes,
  templatesRoutes,
  alertThresholdRoutes,
} = require('./settings');
const {
  osintToolsRoutes,
  maigretRoutes,
  wmnRoutes,
  postLocationRoutes,
  ragRoutes,
} = require('./osint');
const { reportRoutes } = require('./reports');
const { uploadRoutes } = require('./uploads');
const { bluwebRoutes } = require('./web-intel');
const { searchRoutes } = require('./search');
const { mediaRoutes } = require('./media');
const { brandingRoutes } = require('./branding/branding.routes');
const { authorize } = require('../middleware/auth.middleware');
const { getMyPermissions, getAllPages } = require('./user/user.controller');
const { ROLE_SLUGS } = require('./role/role.utils');
const { roleRoutes } = require('./role');
const { assertJwtConfigured, shouldSeedDefaultAdmin, isProduction } = require('../config/env');

/**
 * Unified API router mounted at `/api`.
 */
const router = express.Router();

// Public (no auth) — login page branding by port
router.use('/branding', brandingRoutes);

router.use(authRoutes);

router.get('/me/permissions', authorize(), getMyPermissions);
router.get('/pages', authorize({ manageUsers: true }), getAllPages);

router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/alerts', alertRoutes);
router.use('/grievances', grievanceRoutes);
router.use('/events', eventRoutes);
router.use('/occasion-calendar', occasionCalendarRoutes);
router.use('/master-calendar', occasionCalendarRoutes);
router.use('/dashboard', dashboardRoutes);

// Additional module routes
router.use('/health', healthRoutes);
router.use('/social-profiles', socialProfileRoutes);
router.use('/intelligence', intelligenceRoutes);
router.use('/keywords', keywordRoutes);
router.use('/settings', settingsRoutes);
router.use('/alert-thresholds', alertThresholdRoutes);
router.use('/osint-tools', osintToolsRoutes);
router.use('/maigret', maigretRoutes);
router.use('/wmn', wmnRoutes);
router.use('/post-location', postLocationRoutes);
router.use('/rag', ragRoutes);
router.use('/reports', reportRoutes);
router.use('/uploads', uploadRoutes);
router.use('/media', mediaRoutes);
router.use('/criticism', criticismRoutes);
router.use('/grievance-workflow', grievanceWorkflowRoutes);
router.use('/query-workflow', queryRoutes);
router.use('/suggestion', suggestionRoutes);
router.use('/suggestions', suggestionRoutes);
router.use('/policies', policyRoutes);
router.use('/templates', templatesRoutes);
router.use('/web-intelligence', bluwebRoutes);
router.use('/search', searchRoutes);

module.exports = {
  router,
  authorize,
  ROLE_SLUGS,
  assertJwtConfigured,
  shouldSeedDefaultAdmin,
  isProduction,
  healthRoutes,
  socialProfileRoutes,
  intelligenceRoutes,
  keywordRoutes,
  settingsRoutes,
  policyRoutes,
  templatesRoutes,
  alertThresholdRoutes,
  osintToolsRoutes,
  maigretRoutes,
  wmnRoutes,
  postLocationRoutes,
  ragRoutes,
  reportRoutes,
  uploadRoutes,
  bluwebRoutes,
};
