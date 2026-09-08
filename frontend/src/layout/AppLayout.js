import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth.context';
import Header from './Header';
import Sidebar from './Sidebar';
import { cn } from '../lib/utils';

const AppLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Home / Health / Reports fill edge-to-edge (no main gutters).
  const flushMain =
    location.pathname === '/dashboard' ||
    location.pathname === '/' ||
    location.pathname === '/system-health' ||
    location.pathname === '/reports';

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <Header
        user={user}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onLogout={handleLogout}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar open={sidebarOpen} items={user?.sidebar || []} />
        <main
          className={cn(
            'min-h-0 flex-1 overflow-auto transition-[margin] duration-300',
            flushMain
              ? 'flex flex-col p-0 [&>*]:min-h-0 [&>*]:flex-1'
              : 'p-2 lg:p-3',
            sidebarOpen ? 'ml-[72px]' : 'ml-0'
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
