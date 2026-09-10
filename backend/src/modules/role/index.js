const roleRoutes = require('./role.routes');
const { ensureSystemRoles, getRoleBySlug } = require('./role.service');

module.exports = {
  roleRoutes,
  ensureSystemRoles,
  getRoleBySlug,
};
