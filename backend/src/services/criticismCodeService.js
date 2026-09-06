/** @deprecated Use grievance.report.service nextUniqueCode — Postgres counters. */
const { nextUniqueCode, REPORT_TYPES } = require('../modules/grievances/grievance.report.service');

const generateCriticismCode = (platform = 'x') =>
  nextUniqueCode(REPORT_TYPES.criticism, platform);

module.exports = {
  CRITICISM_COUNTER_KEY: 'criticism_unique_code',
  generateCriticismCode,
};
