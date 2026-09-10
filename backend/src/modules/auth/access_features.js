/**
 * Access catalogs — pages and platforms assigned per user (not on roles).
 *
 * Superadmin = console only (no Alerts/Profiles/…).
 * Admin/User = ops pages (+ admin may manage their users).
 */

const PAGE_CATALOG = [
  { name: 'Dashboard', label: 'Home', path: '/dashboard', icon: 'LayoutDashboard' },
  { name: 'Alerts', label: 'Alerts', path: '/alerts', icon: 'AlertTriangle' },
  { name: 'Grievances', label: 'Grievance', path: '/grievances', icon: 'MessageSquare' },
  { name: 'Events', label: 'Events', path: '/events', icon: 'CalendarDays' },
  { name: 'Profile Catalog', label: 'Profiles', path: '/social-profiles', icon: 'Contact2' },
  { name: 'Analysis Tools', label: 'Tools', path: '/analysis-tools', icon: 'Wrench' },
  { name: 'Create Web Intelligence', label: 'Web Intel', path: '/web-intelligence', icon: 'Globe' },
  { name: 'Reports', label: 'Reports', path: '/reports', icon: 'FileText' },
  { name: 'AI Assistant', label: 'AI', path: '/ai-assistant', icon: 'Bot' },
  { name: 'Users Management', label: 'Users', path: '/users-management', icon: 'Users' },
  { name: 'Settings', label: 'Settings', path: '/settings', icon: 'Settings' },
  { name: 'Policies', label: 'Policies', path: '/policies', icon: 'Shield' },
  { name: 'System Health', label: 'Health', path: '/system-health', icon: 'Activity' },
  { name: 'Help', label: 'Help', path: '/help', icon: 'HelpCircle' },
];

const PLATFORM_CATALOG = ['x', 'facebook', 'instagram', 'youtube', 'telegram'];

/** Pages only for Superadmin console (no tenant ops). */
const SUPERADMIN_PAGE_PATHS = [
  '/dashboard',
  '/users-management',
  '/system-health',
  '/help',
];

/** Ops modules Superadmin can grant to Admins (and Admins to Users). */
const OPS_PAGE_PATHS = [
  '/dashboard',
  '/alerts',
  '/grievances',
  '/events',
  '/social-profiles',
  '/analysis-tools',
  '/web-intelligence',
  '/reports',
  '/ai-assistant',
  '/settings',
  '/policies',
  '/system-health',
  '/help',
];

/** Admin console pages (manage their users) + ops. */
const ADMIN_PAGE_PATHS = [
  ...OPS_PAGE_PATHS,
  '/users-management',
];

/** Pages Superadmin may grant to an Admin (ops + users management). */
const GRANTABLE_TO_ADMIN_PATHS = [...ADMIN_PAGE_PATHS];

/** Pages Admin may grant to a User (ops only — no users management). */
const GRANTABLE_TO_USER_PATHS = [...OPS_PAGE_PATHS];

const ALL_PAGE_PATHS = PAGE_CATALOG.map((p) => p.path);

const DEFAULT_ADMIN_MAX_PROFILES = 50;
const DEFAULT_ADMIN_MAX_USERS = 10;

/** Defaults copied onto the user row at create time (then editable). */
const DEFAULT_ACCESS_BY_ROLE = {
  superadmin: {
    allowed_pages: [...SUPERADMIN_PAGE_PATHS],
    allowed_platforms: [],
    can_manage_users: true,
  },
  admin: {
    allowed_pages: [...ADMIN_PAGE_PATHS],
    // Chosen explicitly when Superadmin creates/edits the admin — not auto-filled.
    allowed_platforms: [],
    can_manage_users: true,
  },
  user: {
    allowed_pages: [...OPS_PAGE_PATHS],
    // Inherit admin platforms in resolveAccessForAssignee — not auto-filled here.
    allowed_platforms: [],
    can_manage_users: false,
  },
};

const getDefaultAccessForRole = (roleSlug) => {
  const key = String(roleSlug || 'user').toLowerCase();
  return (
    DEFAULT_ACCESS_BY_ROLE[key] || {
      allowed_pages: [...OPS_PAGE_PATHS],
      allowed_platforms: [],
      can_manage_users: false,
    }
  );
};

/** Pages the actor is allowed to grant to a given target role. */
const grantablePagesForTarget = (actor, targetRoleSlug) => {
  const target = String(targetRoleSlug || 'user').toLowerCase();
  if (actor?.role === 'superadmin') {
    if (target === 'admin') {
      return PAGE_CATALOG.filter((p) => GRANTABLE_TO_ADMIN_PATHS.includes(p.path));
    }
    return PAGE_CATALOG.filter((p) => GRANTABLE_TO_USER_PATHS.includes(p.path));
  }
  // Admin → user only, capped to own pages ∩ grantable-to-user
  const own = new Set(actor?.allowed_pages || []);
  return PAGE_CATALOG.filter(
    (p) => GRANTABLE_TO_USER_PATHS.includes(p.path) && own.has(p.path)
  );
};

/** Sidebar from user.allowed_pages only (no full-catalog bypass). */
const sidebarForUser = (user) => {
  const allowed = new Set((user?.allowed_pages || []).map((p) => String(p)));
  if (!allowed.size && user?.role === 'superadmin') {
    return PAGE_CATALOG.filter((item) => SUPERADMIN_PAGE_PATHS.includes(item.path));
  }
  return PAGE_CATALOG.filter((item) => allowed.has(item.path));
};

module.exports = {
  PAGE_CATALOG,
  PLATFORM_CATALOG,
  ALL_PAGE_PATHS,
  SUPERADMIN_PAGE_PATHS,
  OPS_PAGE_PATHS,
  ADMIN_PAGE_PATHS,
  GRANTABLE_TO_ADMIN_PATHS,
  GRANTABLE_TO_USER_PATHS,
  DEFAULT_ADMIN_MAX_PROFILES,
  DEFAULT_ADMIN_MAX_USERS,
  DEFAULT_ACCESS_BY_ROLE,
  getDefaultAccessForRole,
  grantablePagesForTarget,
  sidebarForUser,
};
