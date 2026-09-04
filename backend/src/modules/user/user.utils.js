const toPublicUser = (user, role) => {
  const allowed_pages = role?.allowed_pages || [];
  const roleSlug = role?.slug || null;
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
    theme_color: user.theme_color || '#1e3a8a',
    created_at: user.created_at,
    is_active: true,
  };
};

module.exports = { toPublicUser };
