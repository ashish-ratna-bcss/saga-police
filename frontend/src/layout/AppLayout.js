import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/auth.context';
import Header from './Header';
import Sidebar from './Sidebar';
import { cn } from '../lib/utils';
import { Loader2 } from 'lucide-react';
import { resolvePublicAssetUrl } from '../lib/publicAssetUrl';

const AppLayout = () => {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (user) {
      const title = user.blurasagatitle || user.theme_name || 'BLURA SAGA';
      const desc = user.blurasagadescription || user.theme_description || 'Cyber Intelligence Platform';
      document.title = `${title} — ${desc}`;

      // Update favicon
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      const logoPath = user.blurasagalogo || user.theme_logo || '/favicon.ico';
      link.href = resolvePublicAssetUrl(logoPath);
    }
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs font-semibold text-muted-foreground">Checking authentication session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

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
            'min-h-0 flex-1 overflow-auto p-3 lg:p-4 transition-[margin] duration-300',
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
