/** @deprecated Use grievance.report.service nextUniqueCode — Postgres counters. */
const { nextUniqueCode, REPORT_TYPES } = require('../modules/grievances/grievance.report.service');

const generateGrievanceWorkflowCode = (platform = 'x') =>
  nextUniqueCode(REPORT_TYPES.grievance, platform);

module.exports = {
  GRIEVANCE_WF_COUNTER_KEY: 'grievance_workflow_unique_code',
  generateGrievanceWorkflowCode,
};
