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
const { analyticsHubRoutes } = require('./analytics-hub');
const { healthRoutes } = require('./health');
const { blugateRoutes } = require('./blugate');
const { socialProfileRoutes } = require('./social-profiles');
const { intelligenceRoutes } = require('./intelligence');
const {
  settingsRoutes,
  policyRoutes,
  templatesRoutes,
  alertThresholdRoutes,
} = require('./settings');

const { reportRoutes } = require('./reports');
const { osintRoutes } = require('./osint');
const periscopeRoutes = require('./periscope/periscope.routes');
const { uploadRoutes } = require('./uploads');

const { scrapeRoutes } = require('./scrape');
const { searchRoutes } = require('./search');
const { mediaRoutes } = require('./media');
const { brandingRoutes } = require('./branding/branding.routes');
const { auditRoutes } = require('./audit/audit.routes');
const { authorize } = require('../middleware/auth.middleware');
const { auditMutationMiddleware } = require('../lib/audit');
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

// Log every mutating request (theme, users, settings, …) into tenant audit_logs
router.use(auditMutationMiddleware);

router.use(authRoutes);

router.get('/me/permissions', authorize(), getMyPermissions);
router.get('/pages', authorize({ manageUsers: true }), getAllPages);

router.use('/audit', auditRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/alerts', alertRoutes);
router.use('/grievances', grievanceRoutes);
router.use('/events', eventRoutes);
router.use('/occasion-calendar', occasionCalendarRoutes);
router.use('/master-calendar', occasionCalendarRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/analytics-hub', analyticsHubRoutes);

// Additional module routes
router.use('/health', healthRoutes);
router.use('/blugate', blugateRoutes);
router.use('/social-profiles', socialProfileRoutes);
router.use('/intelligence', intelligenceRoutes);
router.use('/keywords', keywordRoutes);
router.use('/settings', settingsRoutes);
router.use('/alert-thresholds', alertThresholdRoutes);

router.use('/reports', reportRoutes);
router.use('/periscope', periscopeRoutes);
router.use('/uploads', uploadRoutes);
router.use('/media', mediaRoutes);
router.use('/criticism', criticismRoutes);
router.use('/grievance-workflow', grievanceWorkflowRoutes);
router.use('/query-workflow', queryRoutes);
router.use('/suggestion', suggestionRoutes);
router.use('/suggestions', suggestionRoutes);
router.use('/policies', policyRoutes);
router.use('/templates', templatesRoutes);

router.use('/osint', osintRoutes);
router.use('/scrape', scrapeRoutes);
router.use('/search', searchRoutes);

module.exports = {
  router,
  authorize,
  ROLE_SLUGS,
  assertJwtConfigured,
  shouldSeedDefaultAdmin,
  isProduction,
  healthRoutes,
  analyticsHubRoutes,
  socialProfileRoutes,
  intelligenceRoutes,
  keywordRoutes,
  settingsRoutes,
  policyRoutes,
  templatesRoutes,
  alertThresholdRoutes,

  osintRoutes,
  reportRoutes,
  scrapeRoutes,
  uploadRoutes,

};
