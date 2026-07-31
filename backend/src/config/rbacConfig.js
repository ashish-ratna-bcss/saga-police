const ALL_PAGES = [
  { path: '/dashboard', name: 'Dashboard', icon: 'LayoutDashboard' },
  { path: '/alerts', name: 'Alerts', icon: 'AlertTriangle' },
  { path: '/monitors', name: 'SM Handles', icon: 'Monitor' },
  { path: '/grievances', name: 'Grievances', icon: 'MessageSquare' },
  { path: '/global-search', name: 'Global Search', icon: 'Globe' },
  { path: '/events', name: 'Events', icon: 'CalendarDays' },
  { path: '/events-report', name: 'Events Report', icon: 'FileText' },
  { path: '/unified-reports', name: 'Unified Reports', icon: 'FileText' },
  { path: '/settings', name: 'Settings', icon: 'Settings' },
  { path: '/help', name: 'Help Guide', icon: 'HelpCircle' },
  { path: '/announcements', name: 'Announcements', icon: 'Megaphone' },
  { path: '/sources', name: 'Sources', icon: 'Rss' },
  { path: '/person-of-interest', name: 'Profile', icon: 'UserSearch' },
  { path: '/access-management', name: 'Access Management', icon: 'ShieldCheck' }
];

const PAGE_FEATURES = {
  '/alerts': [
    { id: 'active', label: 'Active' },
    { id: 'false_positive', label: 'False Positive' },
    { id: 'acknowledged', label: 'Acknowledged' },
    { id: 'escalated', label: 'Escalated' },
    { id: 'reports', label: 'Reports' }
  ],
  '/monitors': [
    { id: 'x', label: 'X Monitor' },
    { id: 'facebook', label: 'Facebook Monitor' },
    { id: 'instagram', label: 'Instagram Monitor' },
    { id: 'youtube', label: 'YouTube Monitor' }
  ],
  '/grievances': [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'closed', label: 'Closed' },
    { id: 'fir', label: 'FIR' },
    { id: 'reports', label: 'Reports' }
  ]
};

const GRIEVANCE_FEATURE_ALIASES = {
  escalated: 'pending'
};

module.exports = {
  ALL_PAGES,
  PAGE_FEATURES,
  GRIEVANCE_FEATURE_ALIASES
};
