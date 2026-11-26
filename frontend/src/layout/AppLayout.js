import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth.context';
import Header from './Header';
import Sidebar from './Sidebar';
import { cn } from '../lib/utils';
import { Loader2 } from 'lucide-react';
import { resolvePublicAssetUrl } from '../lib/publicAssetUrl';

const catalogRootForPath = (pathname, catalogPaths) => {
  const path = String(pathname || '').split('?')[0];
  const roots = Array.isArray(catalogPaths) ? catalogPaths.map(String) : [];
  const matches = roots.filter(
    (root) => path === root || path.startsWith(`${root}/`)
  );
  if (!matches.length) return null;
  return matches.sort((a, b) => b.length - a.length)[0];
};

const AppLayout = () => {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Desktop: open by default. Mobile: closed so content uses full width.
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e) => {
      // When crossing to mobile, collapse so main content is not crushed.
      if (!e.matches) setSidebarOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Close overlay sidebar after navigation on small screens.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(min-width: 768px)').matches) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  const pageAccessDenied = useMemo(() => {
    if (!user) return false;
    const root = catalogRootForPath(location.pathname, user.page_catalog_paths);
    // Unknown / non-catalog routes (monitors, POI, …) — login-gated only
    if (!root) return false;
    const sidebarPaths = new Set(
      (Array.isArray(user.sidebar) ? user.sidebar : [])
        .map((item) => item?.path || item?.href)
        .filter(Boolean)
        .map(String)
    );
    return !sidebarPaths.has(root);
  }, [user, location.pathname]);

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
      const rawUrl = resolvePublicAssetUrl(logoPath);
      link.href = rawUrl;

      // Browsers render the favicon image as-is with no CSS, so to get rounded
      // corners in the tab we draw it onto a canvas with a rounded clip and use
      // that as the favicon instead. Falls back to the raw image on any failure
      // (network error, or a cross-origin image without CORS headers tainting
      // the canvas) so the favicon never ends up broken.
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const size = 64;
          const radius = size * 0.2;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.beginPath();
          ctx.moveTo(radius, 0);
          ctx.arcTo(size, 0, size, size, radius);
          ctx.arcTo(size, size, 0, size, radius);
          ctx.arcTo(0, size, 0, 0, radius);
          ctx.arcTo(0, 0, size, 0, radius);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, 0, 0, size, size);
          link.href = canvas.toDataURL('image/png');
        } catch {
          // Tainted canvas (no CORS on the image) — keep the raw favicon set above.
        }
      };
      img.src = rawUrl;
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

  if (pageAccessDenied) {
    const fallback =
      (Array.isArray(user.sidebar) && (user.sidebar[0]?.path || user.sidebar[0]?.href)) ||
      '/dashboard';
    return <Navigate to={fallback} replace />;
  }

  // The Help page embeds real pages in an iframe (?helpEmbed=1) without the header and sidebar.
  const helpEmbed =
    typeof window !== 'undefined' &&
    window.self !== window.top &&
    (window.name === 'help-embed' || new URLSearchParams(location.search).get('helpEmbed') === '1');
  if (helpEmbed) {
    return (
      <div className="h-screen w-full overflow-hidden bg-background p-3 lg:p-4">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <Header
        user={user}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onLogout={handleLogout}
      />
      <div className="flex min-h-0 flex-1 relative">
        {/* Mobile overlay — sidebar draws over content instead of shrinking it */}
        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 top-16 z-30 bg-black/40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}
        <Sidebar open={sidebarOpen} items={user?.sidebar || []} />
        <main
          className={cn(
            'min-h-0 flex-1 overflow-auto overflow-x-hidden p-3 sm:p-3.5 lg:p-4 transition-[margin] duration-300 w-full max-w-full',
            // On md+ the icon rail reserves space; on mobile it overlays (ml-0).
            sidebarOpen ? 'ml-0 md:ml-[72px]' : 'ml-0'
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
