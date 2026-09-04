import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useRbac } from '../contexts/RbacContext';
import AccessDenied from './AccessDenied';
import {
  LayoutDashboard, AlertTriangle, BarChart3,
  Settings, LogOut, Menu, HelpCircle, CalendarDays, MessageSquare,
  UserSearch, Wrench, Bot, Activity, Users, ShieldCheck, BellOff,
} from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { toast } from 'sonner';

const SIDEBAR_ICONS = {
  LayoutDashboard,
  AlertTriangle,
  MessageSquare,
  CalendarDays,
  UserSearch,
  Wrench,
  BarChart3,
  Bot,
  Users,
  ShieldCheck,
  Settings,
  Activity,
  HelpCircle,
};

const SIDEBAR_WIDTH = 64;

const Layout = () => {
  const { user, logout } = useAuth();
  const { hasAccess, normalizeRoutePath, loading: rbacLoading } = useRbac();
  const { unreadCount, markAllRead } = useNotification();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location.pathname, isMobile]);

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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navigation = useMemo(
    () =>
      (Array.isArray(user?.sidebar) ? user.sidebar : [])
        .map((item) => ({
          name: item.name,
          href: item.path || item.href,
          icon: SIDEBAR_ICONS[item.icon] || Settings,
        }))
        .filter((item) => item.href && hasAccess(item.href)),
    [user?.sidebar, hasAccess]
  );

  const normalizedPath = normalizeRoutePath(location.pathname);
  const isRouteAllowed = location.pathname === '/' || hasAccess(normalizedPath);
  const showAccessDenied = !rbacLoading && !isRouteAllowed;
  const isFullWidthPage =
    (location.pathname.includes('/person-of-interest/') && location.pathname.split('/').length > 2) ||
    location.pathname.startsWith('/reports/generate/') ||
    location.pathname === '/sources' ||
    location.pathname === '/settings' ||
    location.pathname === '/help';

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden relative print:h-auto print:overflow-visible">
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Full-width header — menu + single logo */}
      <header
        className="fixed top-0 left-0 right-0 h-16 bg-primary z-50 select-none print:hidden"
        data-testid="app-header"
      >
        <div className="flex items-center justify-between h-full px-3 sm:px-5">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen((v) => !v)}
              data-testid="sidebar-toggle-btn"
              className="h-10 w-10 text-white hover:bg-white/10 shrink-0"
              aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            >
              <Menu className="h-5 w-5" />
            </Button>

            <img
              src="/appolicelogo.png"
              alt="Andhra Pradesh Police"
              className="h-10 w-10 rounded-md object-contain bg-white p-0.5 ring-1 ring-white/20 shrink-0"
            />

            <div className="min-w-0 leading-tight">
              <div className="flex items-center gap-1.5">
                <h1 className="text-base sm:text-xl font-heading font-bold tracking-[0.12em] text-white truncate">
                  SOCEYE
                </h1>
                <img
                  src="/EYE-01.png"
                  alt=""
                  className="hidden sm:block h-8 w-auto object-contain"
                />
              </div>
              <p className="hidden sm:block text-[9px] lg:text-[10px] text-white/70 tracking-widest uppercase truncate">
                Social Media Observation and Cyber Intelligence
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <img
              src="/Logo.png"
              alt="BCSS"
              className="hidden md:block h-8 w-auto object-contain"
            />

            <div className="hidden sm:block h-6 w-px bg-white/20" />

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
                className="h-9 w-9 text-white hover:bg-white/10"
                aria-label="Clear notifications"
              >
                <BellOff className="h-4 w-4" />
              </Button>
            )}

            <div className="hidden sm:block h-6 w-px bg-white/20" />

            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <div className="text-xs lg:text-sm font-semibold text-white truncate max-w-[140px]">
                  {user?.name}
                </div>
                <div className="text-[10px] text-white/70 uppercase tracking-wide">
                  {user?.role}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                data-testid="logout-btn"
                className="h-9 w-9 text-white hover:bg-red-500/20 hover:text-red-200"
                aria-label="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Icon-only sidebar under header — no logo */}
      <aside
        className={`fixed top-16 left-0 bottom-0 z-40 flex flex-col items-center bg-primary select-none transition-transform duration-300 ease-out print:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: SIDEBAR_WIDTH }}
        data-testid="sidebar"
        role="navigation"
        aria-label="Main navigation"
      >
        <TooltipProvider delayDuration={150} skipDelayDuration={0}>
          <nav
            className="flex-1 w-full overflow-y-auto overscroll-contain py-2 flex flex-col items-center gap-0.5"
            style={{ scrollbarWidth: 'none' }}
          >
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive =
                location.pathname === item.href ||
                location.pathname.startsWith(`${item.href}/`);
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Link
                      to={item.href}
                      aria-label={item.name}
                      data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                      className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                        isActive
                          ? 'bg-white/15 text-white'
                          : 'text-white/45 hover:text-white/85 hover:bg-white/10'
                      }`}
                    >
                      {isActive && (
                        <span
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r-full bg-[hsl(43,96%,58%)]"
                          aria-hidden="true"
                        />
                      )}
                      <span className="relative inline-flex">
                        <Icon className="h-[20px] w-[20px]" strokeWidth={isActive ? 2.2 : 1.7} />
                        {item.name === 'Alerts' && unreadCount > 0 && (
                          <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[8px] font-bold min-w-[14px] h-[14px] px-0.5 flex items-center justify-center rounded-full">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </span>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    sideOffset={10}
                    className="border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
                  >
                    {item.name}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </nav>
        </TooltipProvider>
      </aside>

      <div
        className={`flex-1 flex flex-col min-h-0 pt-16 transition-all duration-300 print:pt-0 print:pl-0 ${
          sidebarOpen && !isMobile ? 'pl-16' : 'pl-0'
        }`}
      >
        <main
          className={`flex-1 min-h-0 overflow-auto scroll-smooth print:h-auto print:overflow-visible ${
            isFullWidthPage ? 'p-0' : 'p-4 lg:p-6'
          }`}
        >
          {showAccessDenied ? <AccessDenied /> : <Outlet />}
        </main>
      </div>
    </div>
  );
};

export default Layout;
