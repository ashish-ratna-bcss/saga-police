/**
 * Compatibility shim — roles are DB-backed (roles table).
 * Only system slugs: superadmin, admin, user.
 */
const { ROLE_SLUGS } = require('../modules/role/role.utils');

const dbRoleToApp = (role) => role;
const appRoleToDb = (role) => role;

module.exports = { dbRoleToApp, appRoleToDb, ROLE_SLUGS };
