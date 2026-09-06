/** @deprecated Use grievance.report.service nextUniqueCode — Postgres counters. */
const { nextUniqueCode, REPORT_TYPES } = require('../modules/grievances/grievance.report.service');

const generateSuggestionCode = (platform = 'x') =>
  nextUniqueCode(REPORT_TYPES.suggestion, platform);

module.exports = {
  SUGGESTION_COUNTER_KEY: 'suggestion_unique_code',
  generateSuggestionCode,
};
