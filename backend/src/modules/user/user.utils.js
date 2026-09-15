const { publicLogoUrl } = require('./user.logo');
const { readApplicationDetails } = require('./user.application');

const DEFAULT_THEME_VALUE = 'linear-gradient(135deg, #0f172a 0%, #38bdf8 100%)';

const extractThemeColor = (tc) => {
  if (!tc) return DEFAULT_THEME_VALUE;
  if (typeof tc === 'object' && tc.value) return tc.value;
  if (typeof tc === 'string') return tc;
  return DEFAULT_THEME_VALUE;
};

const resolveLogoUrl = (user, creator = null) => {
  if (user?.logo_mime || user?.logo_data) {
    return publicLogoUrl({
      port: user.port,
      username: user.username,
      updatedAt: user.updated_at,
    });
  }
  // Users created by an admin often had no logo_data copied — fall back to creator branding.
  if (creator && (creator.logo_mime || creator.logo_data)) {
    return publicLogoUrl({
      port: creator.port,
      username: creator.username,
      updatedAt: creator.updated_at,
    });
  }
  return '/blura_saga_logo.jpg';
};

const toPublicUser = (user, role, { creator = null } = {}) => {
  const roleSlug = role?.slug || null;
  const app = readApplicationDetails(user);
  return {
    id: user.id,
    name: user.name,
    full_name: user.name,
    username: user.username,
    email: user.email,
    role: roleSlug,
    role_id: user.role_id,
    role_name: role?.name || null,
    can_manage_users: Boolean(user.can_manage_users),
    can_manage_roles: Boolean(user.can_manage_roles),
    allowed_pages: Array.isArray(user.allowed_pages) ? user.allowed_pages : [],
    allowed_platforms: Array.isArray(user.allowed_platforms) ? user.allowed_platforms : [],
    max_profiles: user.max_profiles ?? null,
    max_users: user.max_users ?? null,
    created_by: user.created_by ?? null,
    port: user.port ?? null,
    ui_mode: user.ui_mode === 'dark' ? 'dark' : 'light',
    theme_color: extractThemeColor(user.theme_color),
    application_details: app,
    blurasagatitle: app.title,
    blurasagadescription: app.description,
    blurasagalogo: resolveLogoUrl(user, creator),
    has_logo: Boolean(user.logo_mime || user.logo_data || creator?.logo_mime || creator?.logo_data),
    db_name: user.db_name || null,
    created_at: user.created_at,
    is_active: true,
  };
};

module.exports = { toPublicUser, resolveLogoUrl };
