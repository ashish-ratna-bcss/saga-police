/**
 * Role → sidebar / page access for the frontend.
 * Keys = role slugs. Values = pages that role can open.
 * `label` = short sidebar text; `name` = full title.
 */

const ACCESS_FEATURES = {
  superadmin: [
    { name: 'Dashboard', label: 'Home', path: '/dashboard', icon: 'LayoutDashboard' },
    { name: 'Alerts', label: 'Alerts', path: '/alerts', icon: 'AlertTriangle' },
    { name: 'Grievances', label: 'Grievance', path: '/grievances', icon: 'MessageSquare' },
    { name: 'Events', label: 'Events', path: '/events', icon: 'CalendarDays' },
    { name: 'Profiles', label: 'Profiles', path: '/sources', icon: 'UserSearch' },
    { name: 'Analysis Tools', label: 'Tools', path: '/analysis-tools', icon: 'Wrench' },
    { name: 'Reports', label: 'Reports', path: '/intelligence-dashboard', icon: 'BarChart3' },
    { name: 'AI Assistant', label: 'AI', path: '/ai-assistant', icon: 'Bot' },
    { name: 'Users Management', label: 'Users', path: '/users-management', icon: 'Users' },
    { name: 'Roles Management', label: 'Roles', path: '/roles-management', icon: 'ShieldCheck' },
    { name: 'Settings', label: 'Settings', path: '/settings', icon: 'Settings' },
    { name: 'System Health', label: 'Health', path: '/system-health', icon: 'Activity' },
    { name: 'Help', label: 'Help', path: '/help', icon: 'HelpCircle' },
  ],
  admin: [
    { name: 'Dashboard', label: 'Home', path: '/dashboard', icon: 'LayoutDashboard' },
    { name: 'Alerts', label: 'Alerts', path: '/alerts', icon: 'AlertTriangle' },
    { name: 'Grievances', label: 'Grievance', path: '/grievances', icon: 'MessageSquare' },
    { name: 'Events', label: 'Events', path: '/events', icon: 'CalendarDays' },
    { name: 'Profiles', label: 'Profiles', path: '/sources', icon: 'UserSearch' },
    { name: 'Analysis Tools', label: 'Tools', path: '/analysis-tools', icon: 'Wrench' },
    { name: 'Reports', label: 'Reports', path: '/intelligence-dashboard', icon: 'BarChart3' },
    { name: 'AI Assistant', label: 'AI', path: '/ai-assistant', icon: 'Bot' },
    { name: 'Users Management', label: 'Users', path: '/users-management', icon: 'Users' },
    { name: 'Settings', label: 'Settings', path: '/settings', icon: 'Settings' },
    { name: 'System Health', label: 'Health', path: '/system-health', icon: 'Activity' },
    { name: 'Help', label: 'Help', path: '/help', icon: 'HelpCircle' },
  ],
  user: [
    { name: 'Dashboard', label: 'Home', path: '/dashboard', icon: 'LayoutDashboard' },
    { name: 'Alerts', label: 'Alerts', path: '/alerts', icon: 'AlertTriangle' },
    { name: 'Grievances', label: 'Grievance', path: '/grievances', icon: 'MessageSquare' },
    { name: 'Events', label: 'Events', path: '/events', icon: 'CalendarDays' },
    { name: 'Profiles', label: 'Profiles', path: '/sources', icon: 'UserSearch' },
    { name: 'Analysis Tools', label: 'Tools', path: '/analysis-tools', icon: 'Wrench' },
    { name: 'Reports', label: 'Reports', path: '/intelligence-dashboard', icon: 'BarChart3' },
    { name: 'AI Assistant', label: 'AI', path: '/ai-assistant', icon: 'Bot' },
    { name: 'Settings', label: 'Settings', path: '/settings', icon: 'Settings' },
    { name: 'System Health', label: 'Health', path: '/system-health', icon: 'Activity' },
    { name: 'Help', label: 'Help', path: '/help', icon: 'HelpCircle' },
  ],
};

module.exports = { ACCESS_FEATURES };
