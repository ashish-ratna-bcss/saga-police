import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useRbac } from '../contexts/RbacContext';
import AccessDenied from './AccessDenied';
import {
  Shield, LayoutDashboard, Rss, AlertTriangle, BarChart3,
  Settings, FileText, LogOut, Menu, X, Moon, Sun, ChevronRight, HelpCircle, Youtube, Twitter, Facebook, Instagram, Globe, CalendarDays, BellOff, MessageSquare, PhoneCall, Monitor, UserSearch, Search, Wrench, Bot, Activity
} from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';

const Layout = () => {
  const { user, logout } = useAuth();
  const { hasAccess, normalizeRoutePath, loading: rbacLoading } = useRbac();
  const { unreadCount, markAllRead } = useNotification();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Handle responsive breakpoints
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      // On desktop, sidebar should be open by default
      if (!mobile) {
        setSidebarOpen(true);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close sidebar on route change (mobile only)
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [location.pathname, isMobile]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobile && sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobile, sidebarOpen]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle('dark');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const allNavigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Alerts', href: '/alerts', icon: AlertTriangle },
    //{ name: 'Reports', href: '/reports', icon: FileText },
    // { name: 'Sources', href: '/sources', icon: Rss },
    // { name: 'Reports', href: '/reports', icon: FileText },
    //{ name: 'SM Handles', href: '/monitors', icon: Monitor },
    //{ name: 'YouTube Monitor', href: '/youtube-monitor', icon: Youtube },
    //{ name: 'X Monitor', href: '/x-monitor', icon: Twitter },
    //{ name: 'Facebook Monitor', href: '/facebook-monitor', icon: Facebook },
    //{ name: 'Instagram Monitor', href: '/instagram-monitor', icon: Instagram },
    { name: 'Grievances', href: '/grievances', icon: MessageSquare },
    { name: 'Events', href: '/events', icon: CalendarDays },
    { name: 'Profiles', href: '/sources', icon: UserSearch },
        //{ name: 'Global Search', href: '/global-search', icon: Globe },
    
    //{ name: 'Profile', href: '/person-of-interest', icon: UserSearch },
    //{ name: 'Policy Manager', href: '/policies', icon: Shield },
    { name: 'Analysis Tools', href: '/analysis-tools', icon: Wrench },
    { name: 'Reports', href: '/intelligence-dashboard', icon: BarChart3 },
    { name: 'AI Assistant', href: '/ai-assistant', icon: Bot },
    //{ name: 'Access Management', href: '/access-management', icon: Shield, roles: ['superadmin'] },
    { name: 'Settings', href: '/settings', icon: Settings },
    { name: 'System Health', href: '/system-health', icon: Activity },
    { name: 'Help', href: '/help', icon: HelpCircle },

  ];

  const roleFilteredNavigation = user?.role === 'dial100'
    ? allNavigation.filter((item) => item.href === '/dial-100-incident-reporting')
    : allNavigation.filter((item) => !item.roles || item.roles.includes(user?.role));
  const navigation = roleFilteredNavigation.filter((item) => hasAccess(item.href));

  const normalizedPath = normalizeRoutePath(location.pathname);
  const isRouteAllowed = location.pathname === '/' || hasAccess(normalizedPath);
  const showAccessDenied = !rbacLoading && !isRouteAllowed;
  const isFullWidthPage = (location.pathname.includes('/person-of-interest/') && location.pathname.split('/').length > 2) ||
    location.pathname.startsWith('/reports/generate/') ||
    location.pathname === '/sources' ||
    location.pathname === '/settings' ||
    location.pathname === '/help';

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden relative print:h-auto print:overflow-visible">
      {/* Mobile Overlay Backdrop */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Top Bar - Dynamic Theme Color */}
      <header className="fixed top-0 left-0 right-0 h-16 lg:h-20 bg-primary z-50 shadow-lg select-none">
        <div className="flex items-center justify-between h-full px-4 lg:px-6 relative">

          {/* Left: Menu + Logo + Title */}
          <div className="flex items-center gap-3 lg:gap-4 relative z-10">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              data-testid="sidebar-toggle-btn"
              className="text-white hover:bg-white/10 h-10 w-10 lg:h-11 lg:w-11"
              aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            >
              <Menu className="h-5 w-5 lg:h-6 lg:w-6" />
            </Button>

            <div className="flex items-center gap-3 lg:gap-4">
              <div className="relative">
                <img
                  src="/policelogo.jpg"
                  alt="Logo"
                  className="h-10 w-10 lg:h-14 lg:w-14 object-cover rounded shadow-lg"
                />
              </div>

              <div className="flex flex-col items-start justify-start text-left leading-tight">
                <div className="flex items-center gap-2">
                <h1 className="text-base lg:text-2xl font-heading font-bold text-white tracking-wider uppercase drop-shadow-md">SOCEYE</h1>
                  <img
                    src="/EYE-01.png"
                    alt="EYE"
                    className="hidden lg:block h-35 w-20 object-contain"
                  />
                </div>
                <span className="hidden sm:block text-[9px] lg:text-[10px] text-white/80 font-medium tracking-widest uppercase drop-shadow">SOCIAL MEDIA OBSERVATION AND CYBER INTELLIGENCE
</span>
              </div>
            </div>
          </div>

          {/* Center: AI Search Bar removed */}

          {/* Right: Logo + Theme + User */}
          <div className="flex items-center gap-2 lg:gap-4">
            <img src="/Logo.png" alt="BCSS Logo" className="h-8 lg:h-10 w-auto object-contain" />

            <div className="hidden sm:block h-6 lg:h-8 w-px bg-white/20"></div>

            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  try {
                    await markAllRead();
                    toast.success('Notifications cleared');
                  } catch {
                    toast.error('Failed to clear notifications');
                  }
                }}
                data-testid="clear-all-notifications-btn"
                className="text-white hover:bg-white/10 h-9 w-9 lg:h-10 lg:w-10"
                aria-label="Clear all notifications"
              >
                <BellOff className="h-4 w-4 lg:h-5 lg:w-5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleDarkMode}
              data-testid="theme-toggle-btn"
              className="text-white hover:bg-white/10 h-9 w-9 lg:h-10 lg:w-10"
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun className="h-4 w-4 lg:h-5 lg:w-5 text-[hsl(43,96%,70%)]" /> : <Moon className="h-4 w-4 lg:h-5 lg:w-5" />}
            </Button>

            <div className="hidden sm:block h-6 lg:h-8 w-px bg-white/20"></div>

            <div className="flex items-center gap-2 lg:gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-xs lg:text-sm font-semibold text-white truncate max-w-[120px] lg:max-w-none">{user?.full_name}</div>
                <div className="text-[10px] lg:text-xs text-white/80 font-medium uppercase tracking-wide">{user?.role}</div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                data-testid="logout-btn"
                className="text-white hover:bg-red-500/20 hover:text-red-200 h-9 w-9 lg:h-10 lg:w-10"
                aria-label="Logout"
              >
                <LogOut className="h-4 w-4 lg:h-5 lg:w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Sidebar - Narrow icon-based nav */}
      <aside
        className={`fixed top-16 lg:top-20 left-0 bottom-0 w-[82px] bg-primary shadow-xl z-40 transform transition-transform duration-300 ease-in-out select-none ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        data-testid="sidebar"
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Navigation Links */}
        <nav className="flex flex-col items-center gap-0.5 py-3 overflow-y-auto max-h-[calc(100vh-10rem)]" style={{ scrollbarWidth: 'none' }}>
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                data-testid={`nav-${item.name.toLowerCase().replace(' ', '-')}`}
                className={`relative flex flex-col items-center justify-center w-[70px] py-2.5 rounded-xl text-center transition-all duration-200 group ${
                  isActive
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/50 hover:bg-white/[0.05] hover:text-white/80'
                }`}
              >
                <div className="relative">
                  <Icon className={`h-[22px] w-[22px] mb-1 ${isActive ? 'text-white' : 'text-white/50 group-hover:text-white/80'}`} />
                  {item.name === 'Alerts' && unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[9px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full shadow-lg shadow-red-500/30">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] leading-tight font-medium ${isActive ? 'text-white' : 'text-white/40 group-hover:text-white/70'}`}>{item.name}</span>
              </Link>
            );
          })}
        </nav>

      </aside>

      {/* Main Content */}
      <div
        className={`flex-1 flex flex-col min-h-0 pt-16 lg:pt-20 transition-all duration-300 print:pt-0 print:pl-0 print:h-auto print:overflow-visible ${sidebarOpen && !isMobile ? 'lg:pl-[82px]' : 'pl-0'
          }`}
      >
        <main className={`flex-1 min-h-0 ${isFullWidthPage ? 'p-0' : 'p-4 lg:p-8'} overflow-auto scroll-smooth print:h-auto print:overflow-visible`}>
          {showAccessDenied ? <AccessDenied /> : <Outlet />}
        </main>
      </div>
    </div>
  );
};

export default Layout;
