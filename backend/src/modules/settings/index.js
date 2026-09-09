const settingsRoutes = require('./settings.routes');
const policyRoutes = require('./policy.routes');
const templatesRoutes = require('./templates.routes');
const alertThresholdRoutes = require('./alertThreshold.routes');
const settingsService = require('./settings.service');
const mappingService = require('./mapping.service');
const templateService = require('./template.service');

module.exports = {
  settingsRoutes,
  policyRoutes,
  templatesRoutes,
  alertThresholdRoutes,
  settingsService,
  mappingService,
  templateService,
};
