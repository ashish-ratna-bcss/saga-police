/**
 * Single auth middleware: validates JWT, loads user, optional role / page checks.
 *
 *   authorize()                         — token only (any logged-in user)
 *   authorize('admin', 'superadmin')    — token + role
 *   authorize({ roles: ['admin'] })     — token + role
 *   authorize({ pages: ['/alerts'] })   — token + page access
 *   authorize({ manageUsers: true })    — token + can_manage_users
 *   authorize({ manageRoles: true })    — token + can_manage_roles
 */
const jwt = require('jsonwebtoken');
const prisma = require('../../prisma/client');
const logger = require('../utils/logger');
const { getJwtSecret } = require('../config/env');
const { readAuthCookie } = require('../config/cookies');
const { toPublicUser } = require('../modules/user/user.utils');

const getTokenFromRequest = (req) => {
  const fromCookie = readAuthCookie(req);
  if (fromCookie) return fromCookie;

  if (req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') return parts[1];
    return req.headers.authorization;
  }
  return req.headers['x-access-token'];
};

const normalizePath = (value) => {
  if (!value || typeof value !== 'string') return '/';
  const path = value.replace(/\/+$/, '') || '/';
  return path.startsWith('/') ? path : `/${path}`;
};

const parseOptions = (args) => {
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    return {
      roles: args[0].roles || [],
      pages: args[0].pages || [],
      manageUsers: Boolean(args[0].manageUsers),
      manageRoles: Boolean(args[0].manageRoles),
    };
  }
  return {
    roles: args.filter((a) => typeof a === 'string'),
    pages: [],
    manageUsers: false,
    manageRoles: false,
  };
};

const roleAllowed = (userRole, requiredRoles) => {
  if (!requiredRoles.length) return true;
  return Boolean(userRole && requiredRoles.includes(userRole));
};

const pageAllowed = (user, requiredPages) => {
  if (!requiredPages.length) return true;
  if (user.role === 'superadmin') return true;
  const allowed = (user.allowed_pages || []).map(normalizePath);
  return requiredPages.some((pagePath) => {
    const normalized = normalizePath(pagePath);
    return allowed.includes(normalized)
      || allowed.some((p) => normalized.startsWith(`${p}/`));
  });
};

const authorize = (...args) => {
  const { roles, pages, manageUsers, manageRoles } = parseOptions(args);

  return async (req, res, next) => {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token' });
    }

    try {
      const decoded = jwt.verify(token, getJwtSecret());
      const user = await prisma.users.findUnique({
        where: { id: decoded.user_id },
        include: { roles: true },
      });
      if (!user) {
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }

      req.user = toPublicUser(user, user.roles);

      if (roles.length && !roleAllowed(req.user.role, roles)) {
        return res.status(403).json({
          message: `User role ${req.user.role} is not authorized to access this route`,
        });
      }

      if (manageUsers && !req.user.can_manage_users) {
        return res.status(403).json({ message: 'Not allowed to manage users' });
      }

      if (manageRoles && !req.user.can_manage_roles) {
        return res.status(403).json({ message: 'Not allowed to manage roles' });
      }

      if (pages.length && !pageAllowed(req.user, pages)) {
        return res.status(403).json({
          code: 'RBAC_PAGE_DENIED',
          message: 'You do not have access to this module',
          required_pages: pages,
        });
      }

      return next();
    } catch (error) {
      logger.error(error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  };
};

module.exports = { authorize };
