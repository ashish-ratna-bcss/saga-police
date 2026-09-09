const extractThemeColor = (tc) => {
  if (!tc) return '#06b6d4';
  if (typeof tc === 'object' && tc.value) return tc.value;
  if (typeof tc === 'string') return tc;
  return '#06b6d4';
};

const toPublicUser = (user, role) => {
  const allowed_pages = role?.allowed_pages || [];
  const roleSlug = role?.slug || null;
  const tc = typeof user.theme_color === 'object' && user.theme_color ? user.theme_color : {};
  return {
    id: user.id,
    name: user.name,
    full_name: user.name,
    username: user.username,
    email: user.email,
    role: roleSlug,
    role_id: user.role_id,
    role_name: role?.name || null,
    can_manage_users: Boolean(role?.can_manage_users),
    can_manage_roles: Boolean(role?.can_manage_roles),
    allowed_pages,
    created_by: user.created_by ?? null,
    ui_mode: user.ui_mode === 'dark' ? 'dark' : 'light',
    theme_color: extractThemeColor(user.theme_color),
    blurasagatitle: tc.blurasagatitle || tc.title || 'BLURA SAGA',
    blurasagadescription: tc.blurasagadescription || tc.description || 'Cyber Intelligence Platform',
    blurasagalogo: tc.blurasagalogo || tc.logo || '/blura_saga_logo.jpg',
    created_at: user.created_at,
    is_active: true,
  };
};

module.exports = { toPublicUser };
