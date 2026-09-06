const grievanceRoutes = require('./grievance.routes');
const grievanceService = require('./grievance.service');
const grievanceSourceService = require('./grievance.source.service');
const grievanceUtils = require('./grievance.utils');
const grievanceResolve = require('./grievance.resolve');
const grievanceReportService = require('./grievance.report.service');
const grievanceReportController = require('./grievance.report.controller');
const {
  grievanceWorkflowRoutes,
  suggestionRoutes,
  criticismRoutes,
  queryRoutes,
} = require('./grievance.report.routes');

module.exports = {
  grievanceRoutes,
  grievanceService,
  grievanceSourceService,
  grievanceUtils,
  grievanceResolve,
  grievanceReportService,
  grievanceReportController,
  grievanceWorkflowRoutes,
  suggestionRoutes,
  criticismRoutes,
  queryRoutes,
  isCatalogStore: grievanceUtils.isCatalogStore,
  findGrievanceDocForReport: grievanceResolve.findGrievanceDocForReport,
};
