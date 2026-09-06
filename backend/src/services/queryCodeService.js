/** @deprecated Use grievance.report.service nextUniqueCode — Postgres counters. */
const { nextUniqueCode, REPORT_TYPES } = require('../modules/grievances/grievance.report.service');

const generateQueryCode = (platform = 'x') =>
  nextUniqueCode(REPORT_TYPES.query, platform);

module.exports = {
  QUERY_COUNTER_KEY: 'query_unique_code',
  generateQueryCode,
};
