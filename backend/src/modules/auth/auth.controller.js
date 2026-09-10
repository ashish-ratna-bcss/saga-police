const bcrypt = require('bcryptjs');
const prisma = require('../../../prisma/client');
const { createAuditLog } = require('../../lib/audit');
const { validateLogin } = require('./auth.validation');
const { generateToken, findUserWithRole } = require('./auth.service');
const { createAuthCookie, deleteAuthCookie } = require('../../config/cookies');
const { sidebarForUser } = require('./access_features');
const { toPublicUser } = require('../user/user.utils');

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const meResponse = (user, role) => {
  const publicUser = toPublicUser(user, role || user.roles);
  return {
    ...publicUser,
    sidebar: sidebarForUser(publicUser),
  };
};

const login = async (req, res) => {
  try {
    const validated = validateLogin(req.body || {});
    if (!validated.ok) {
      return res.status(validated.status).json({ message: validated.message });
    }

    const { username, password } = validated.data;
    const user = await findUserWithRole({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    await createAuditLog(
      { id: user.id, email: user.email, full_name: user.name },
      'login',
      'user',
      user.id,
      { ip: req.ip }
    );

    createAuthCookie(res, generateToken(user.id, user.db_name));
    const publicUser = toPublicUser(user, user.roles);
    return res.json({
      message: 'Logged in',
      ui_mode: publicUser.ui_mode,
      theme_color: publicUser.theme_color,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const logout = (req, res) => {
  deleteAuthCookie(res);
  return res.status(200).json({ message: 'Logged out' });
};

const getMe = async (req, res) => {
  const user = req.user || {};
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
    sidebar: sidebarForUser(user),
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

    return res.status(200).json(meResponse(updated, updated.roles));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  login,
  logout,
  getMe,
  updateMyUiMode,
  updateMyThemeColor,
  updateMyPlatforms,
};
