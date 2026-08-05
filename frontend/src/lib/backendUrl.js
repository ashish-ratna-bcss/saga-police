/**
 * Backend origin resolution — kept free of axios so shared utils and tests
 * can import BACKEND_URL without pulling the HTTP client.
 */
const getDefaultBackendUrl = () => {
  if (typeof window === 'undefined') return 'http://localhost:8000';

  const { hostname, origin, port } = window.location;
  const isIP = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname);

  // If explicitly set in environment, use that UNLESS it's localhost and we are on an IP
  if (process.env.REACT_APP_BACKEND_URL) {
    const envUrl = process.env.REACT_APP_BACKEND_URL;
    const envIsLocalhost = envUrl.includes('localhost') || envUrl.includes('127.0.0.1');
    if (!(envIsLocalhost && isIP)) {
      return envUrl;
    }
  }

  // Handle local development (localhost or 127.0.0.1)
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8000';
  }

  // If accessing via IP (local network testing) or dev port 3000, assume backend is on port 8000
  if (isIP || port === '3000') {
    return `http://${hostname}:8000`;
  }

  // Default fallback
  return origin;
};

export const BACKEND_URL = getDefaultBackendUrl();
