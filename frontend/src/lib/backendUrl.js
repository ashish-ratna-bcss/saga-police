/**
 * Backend origin resolution — kept free of axios so shared utils and tests
 * can import BACKEND_URL without pulling the HTTP client.
 */
const getDefaultBackendUrl = () => {
  if (typeof window === 'undefined') return 'http://localhost:5005';

  const { hostname, origin, port } = window.location;
  const isIP = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname);
  const portNum = port ? parseInt(port, 10) : NaN;
  // Local CRA multi-tenant ports always talk to the API on :5005
  const isLocalDevUiPort = portNum === 3000 || portNum === 3001 || portNum === 3002;

  // Explicit override (production CDN / separate API host)
  if (process.env.REACT_APP_BACKEND_URL) {
    const envUrl = process.env.REACT_APP_BACKEND_URL;
    const envIsLocalhost = envUrl.includes('localhost') || envUrl.includes('127.0.0.1');
    if (!(envIsLocalhost && isIP && !isLocalDevUiPort)) {
      return envUrl;
    }
  }

  // Local CRA (localhost or LAN IP on :3000/:3001/:3002) — API on separate port
  if (hostname === 'localhost' || hostname === '127.0.0.1' || isLocalDevUiPort) {
    return 'http://localhost:5005';
  }

  // Deployed behind nginx (same host: /api and /files proxied) — use page origin.
  if (!port || port === '80' || port === '443' || isIP) {
    return origin;
  }

  return origin;
};

export const BACKEND_URL = getDefaultBackendUrl();
