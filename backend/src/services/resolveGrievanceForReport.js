/**
 * @deprecated Import from modules/grievances instead.
 * Thin shim so old controllers keep working until they are deleted.
 */
module.exports = {
  ...require('../modules/grievances/grievance.resolve'),
  ...require('../modules/grievances/grievance.report.service'),
};
