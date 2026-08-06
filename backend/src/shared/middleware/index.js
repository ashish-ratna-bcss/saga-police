/**
 * Shared middleware re-exports — transition facade toward modules/<name>/http.
 * Do not change middleware behaviour; only centralize import paths for new code.
 */
module.exports = {
  ...require('../../middleware/authMiddleware'),
  ...require('../../middleware/rbacMiddleware'),
};
