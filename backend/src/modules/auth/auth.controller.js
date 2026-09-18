const bcrypt = require('bcryptjs');
const prisma = require('../../../prisma/client');
const { createAuditLog } = require('../../lib/audit');
const { validateLogin } = require('./auth.validation');
const { generateToken, findUserWithRole } = require('./auth.service');
const { createAuthCookie, deleteAuthCookie, readAuthCookie } = require('../../config/cookies');
const { sidebarForUser, PAGE_CATALOG } = require('./access_features');
const { toPublicUser } = require('../user/user.utils');
const {
  findActiveSession,
  createSession,
  revokeOtherSessions,
  revokeSession,
  revokeAllSessions,
  toPublicSession,
} = require('./auth.session');
const { getTenantPrisma } = require('../../lib/tenantDatabase.service');
const { ensureOpsSchema } = require('../../../prisma/ensureOpsSchema');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../../config/env');
const logger = require('../../lib/logger');

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const meResponse = (user, role) => {
  const publicUser = toPublicUser(user, role || user.roles);
  return {
    ...publicUser,
    sidebar: sidebarForUser(publicUser),
    page_catalog_paths: PAGE_CATALOG.map((p) => p.path),
  };
};

const login = async (req, res) => {
  try {
    const validated = validateLogin(req.body || {});
    if (!validated.ok) {
      return res.status(validated.status).json({ message: validated.message });
    }

    const { username, password, force } = validated.data;
    const user = await findUserWithRole({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const active = await findActiveSession(user.id);
    if (active && !force) {
      return res.status(409).json({
        code: 'SESSION_ACTIVE',
        message: 'This account is already logged in on another device',
        session: toPublicSession(active),
      });
    }

    if (active && force) {
      await revokeOtherSessions(user.id, null);
    }

    const session = await createSession(user.id, req);
    if (force) {
      await revokeOtherSessions(user.id, session.id);
    }

    let creator = null;
    if (!user.logo_mime && user.created_by) {
      creator = await prisma.users.findUnique({
        where: { id: user.created_by },
        select: { port: true, username: true, logo_mime: true, updated_at: true },
      });
    }

    const publicUser = toPublicUser(user, user.roles, { creator });
    if (user.db_name) {
      try {
        const tenantPrisma = getTenantPrisma(user.db_name);
        await ensureOpsSchema(tenantPrisma);
        await createAuditLog({
          req,
          user: publicUser,
          action: force ? 'login_force' : 'login',
          resourceType: 'user',
          resourceId: user.id,
          newData: toPublicSession(session),
          tenantPrisma,
        });
      } catch {
        // audit best-effort
      }
    }

    createAuthCookie(res, generateToken(user.id, user.db_name, session.id), req);
    return res.json({
      message: force ? 'Logged in (previous session ended)' : 'Logged in',
      ui_mode: publicUser.ui_mode,
      theme_color: publicUser.theme_color,
      forced: Boolean(force),
    });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const logout = async (req, res) => {
  try {
    let token = readAuthCookie(req);
    if (!token && req?.headers?.authorization) {
      const parts = req.headers.authorization.split(' ');
      token = parts.length === 2 && parts[0] === 'Bearer' ? parts[1] : req.headers.authorization;
    }
    if (!token && req?.cookies) {
      const tokenKey = Object.keys(req.cookies).find((k) => k === 'token' || k.startsWith('token_'));
      if (tokenKey) token = req.cookies[tokenKey];
    }

    let sid = null;
    let userId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, getJwtSecret());
        sid = decoded.sid || null;
        userId = decoded.user_id || null;
      } catch {
        // If token is expired, decode payload anyway so the session in DB is revoked!
        try {
          const decoded = jwt.decode(token);
          if (decoded && typeof decoded === 'object') {
            sid = decoded.sid || null;
            userId = decoded.user_id || null;
          }
        } catch {
          // ignore
        }
      }
    }
    if (sid) await revokeSession(sid);
    if (userId) await revokeOtherSessions(userId, null);

    if (userId) {
      const user = await findUserWithRole({ id: userId });
      if (user?.db_name) {
        await createAuditLog({
          req,
          user: toPublicUser(user, user.roles),
          action: 'logout',
          resourceType: 'user',
          resourceId: user.id,
          details: { sid },
          tenantPrisma: getTenantPrisma(user.db_name),
        });
      }
    }
  } catch {
    // best-effort
  }
  deleteAuthCookie(res, req);
  return res.status(200).json({ message: 'Logged out' });
};

const checkTenantSetupStatus = async (dbName) => {
  if (!dbName) {
    return {
      is_configured: true,
      platform_count: 0,
      keyword_count: 0,
      needs_platforms: false,
      needs_keywords: false,
    };
  }
  try {
    const { getTenantPrisma } = require('../../lib/tenantDatabase.service');
    const { ensureOpsSchema } = require('../../../prisma/ensureOpsSchema');
    const tenantPrisma = getTenantPrisma(dbName);
    await ensureOpsSchema(tenantPrisma);

    const [platformCount, keywordCount] = await Promise.all([
      tenantPrisma.platforms.count({ where: { is_active: true } }),
      tenantPrisma.keywords.count(),
    ]);

    return {
      is_configured: platformCount > 0 && keywordCount > 0,
      platform_count: platformCount,
      keyword_count: keywordCount,
      needs_platforms: platformCount === 0,
      needs_keywords: keywordCount === 0,
    };
  } catch (error) {
    logger.error(`[SetupStatus] error checking setup status for ${dbName}: ${error.message}`);
    return {
      is_configured: true,
      platform_count: 0,
      keyword_count: 0,
      needs_platforms: false,
      needs_keywords: false,
      error: error.message,
    };
  }
};

const getSetupStatus = async (req, res) => {
  try {
    const status = await checkTenantSetupStatus(req.user?.db_name);
    return res.status(200).json(status);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const getMe = async (req, res) => {
  const user = req.user || {};
  const setupStatus = await checkTenantSetupStatus(user.db_name);

  return res.status(200).json({
    ...user,
    name: user.name,
    username: user.username,
    role: user.role,
    ui_mode: user.ui_mode === 'dark' ? 'dark' : 'light',
    theme_color: user.theme_color || 'linear-gradient(135deg, #0f172a 0%, #38bdf8 100%)',
    theme_config: user.theme_config || {},
    blurasagatitle: user.blurasagatitle || 'BLURA SAGA',
    blurasagadescription: user.blurasagadescription || 'Cyber Intelligence Platform',
    blurasagalogo: user.blurasagalogo || '/blura_saga_logo.jpg',
    allowed_pages: user.allowed_pages || [],
    allowed_platforms: user.allowed_platforms || [],
    setup_status: setupStatus,
    sidebar: sidebarForUser(user),
    // Full ACL catalog paths — FE must not hardcode; used to gate URL access
    page_catalog_paths: PAGE_CATALOG.map((p) => p.path),
  });
};

const updateMyUiMode = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const mode = String(req.body?.ui_mode || '').toLowerCase();
    if (mode !== 'light' && mode !== 'dark') {
      return res.status(400).json({ message: 'ui_mode must be light or dark' });
    }

    const updated = await prisma.users.update({
      where: { id: userId },
      data: { ui_mode: mode },
      include: { roles: true },
    });

    await createAuditLog({
      req,
      user: req.user,
      action: 'update',
      resourceType: 'theme',
      resourceId: userId,
      oldData: { ui_mode: req.user?.ui_mode },
      newData: { ui_mode: mode },
    });

    return res.status(200).json(meResponse(updated, updated.roles));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const updateMyThemeColor = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const currentUser = await prisma.users.findUnique({ where: { id: userId } });
    const existingTc = typeof currentUser?.theme_color === 'object' && currentUser?.theme_color ? currentUser.theme_color : {};

    const inputVal = String(req.body?.theme_color || req.body?.theme_config?.value || '').trim();
    if (!inputVal) {
      return res.status(400).json({ message: 'theme_color or theme_config is required' });
    }

    const isGradient = inputVal.startsWith('linear-gradient') || inputVal.startsWith('radial-gradient');
    let primaryHex = '#38bdf8';
    if (isGradient) {
      const matches = inputVal.match(/#([0-9a-fA-F]{6})/g);
      if (matches?.length) {
        primaryHex = matches[matches.length - 1];
      }
    } else {
      if (HEX_COLOR_RE.test(inputVal)) {
        primaryHex = inputVal;
      }
    }

    const themePayload = {
      ...existingTc,
      type: isGradient ? 'gradient' : 'solid',
      value: inputVal,
      primary_hex: primaryHex,
      updated_at: new Date().toISOString(),
    };

    const updated = await prisma.users.update({
      where: { id: userId },
      data: {
        theme_color: themePayload,
      },
      include: { roles: true },
    });

    await createAuditLog({
      req,
      user: req.user,
      action: 'update',
      resourceType: 'theme',
      resourceId: userId,
      oldData: { theme_color: existingTc },
      newData: { theme_color: themePayload },
    });

    return res.status(200).json(meResponse(updated, updated.roles));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

/**
 * Admin manages which social platforms their tenant uses (Settings → Platforms).
 * Syncs tenant `platforms` rows and cascades to users created by this admin.
 */
const updateMyPlatforms = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Only Admin can manage platforms' });
    }

    const { PLATFORM_SLUGS, syncTenantPlatforms } = require('../../lib/platformCatalog');
    const { getTenantPrisma } = require('../../lib/tenantDatabase.service');

    const raw = Array.isArray(req.body?.allowed_platforms) ? req.body.allowed_platforms : null;
    if (!raw) {
      return res.status(400).json({ message: 'allowed_platforms array is required' });
    }

    const allowed = [
      ...new Set(
        raw
          .map((s) => String(s || '').toLowerCase().trim())
          .filter((s) => PLATFORM_SLUGS.includes(s))
      ),
    ];

    const currentUser = await prisma.users.findUnique({
      where: { id: userId },
      include: { roles: true },
    });
    if (!currentUser?.db_name) {
      return res.status(400).json({ message: 'Admin has no tenant database' });
    }

    const updated = await prisma.users.update({
      where: { id: userId },
      data: { allowed_platforms: allowed },
      include: { roles: true },
    });

    // Users under this admin inherit the same platforms.
    await prisma.users.updateMany({
      where: {
        created_by: userId,
        roles: { slug: 'user' },
      },
      data: { allowed_platforms: allowed },
    });

    const tenantPrisma = getTenantPrisma(currentUser.db_name);
    await syncTenantPlatforms(tenantPrisma, allowed);

    await createAuditLog({
      req,
      user: req.user,
      action: 'update',
      resourceType: 'platforms',
      resourceId: userId,
      oldData: { allowed_platforms: currentUser.allowed_platforms || [] },
      newData: { allowed_platforms: allowed },
      tenantPrisma,
    });

    return res.status(200).json(meResponse(updated, updated.roles));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ message: 'current_password and new_password are required' });
    }

    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isValid = await bcrypt.compare(current_password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Incorrect current password' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(new_password, salt);

    await prisma.users.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    await revokeAllSessions(userId);

    await createAuditLog({
      req,
      user: req.user,
      action: 'change_password',
      resourceType: 'user',
      resourceId: user.id,
    });

    deleteAuthCookie(res, req);
    return res.status(200).json({ message: 'Password updated successfully. Please log in again.' });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  login,
  logout,
  getMe,
  getSetupStatus,
  updateMyUiMode,
  updateMyThemeColor,
  updateMyPlatforms,
  changePassword,
};

