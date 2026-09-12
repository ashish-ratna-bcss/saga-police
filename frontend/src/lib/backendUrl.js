/**
 * Backend origin resolution — kept free of axios so shared utils and tests
 * can import BACKEND_URL without pulling the HTTP client.
 *
 * Production (nginx): same-origin — /api and /files are proxied to the tenant API.
 * Local CRA on loopback: http://localhost:5005
 */
const getDefaultBackendUrl = () => {
  if (typeof window === 'undefined') return 'http://localhost:5005';

  const { hostname, origin } = window.location;
  const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1';

  // Explicit override (production CDN / separate API host)
  if (process.env.REACT_APP_BACKEND_URL) {
    const envUrl = process.env.REACT_APP_BACKEND_URL.trim();
    if (envUrl) {
      const envIsLocalhost =
        envUrl.includes('localhost') || envUrl.includes('127.0.0.1');
      // Ignore baked-in localhost when the page is served from a remote host
      if (!(envIsLocalhost && !isLoopback)) {
        return envUrl;
      }
    }
  }

  // Local CRA on this machine
  if (isLoopback) {
    return 'http://localhost:5005';
  }

  // Production build (IP :3000/:3001/:3002 or domain) — nginx proxies /api on same origin
  if (process.env.NODE_ENV === 'production') {
    return origin;
  }

  // Dev CRA opened via LAN IP from the same machine — local API
  return 'http://localhost:5005';
};

export const BACKEND_URL = getDefaultBackendUrl();
