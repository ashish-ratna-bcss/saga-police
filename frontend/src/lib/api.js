import axios from 'axios';
import { BACKEND_URL } from './backendUrl';

export { BACKEND_URL };

const API_URL = `${BACKEND_URL}/api`;

/**
 * Build a dynamic base URL for any service.
 * - Checks for an env-var override first.
 * - In local dev, points to the given devPort on the current hostname.
 * - In production, uses the relative `path` (served via reverse proxy).
 */
const getServiceUrl = (envVar, devPort, path) => {
  if (envVar) return envVar;

  if (typeof window === 'undefined') return `http://localhost:${devPort}${path}`;

  const { hostname, port } = window.location;
  const isIP = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname);

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `http://localhost:${devPort}${path}`;
  }
  if (isIP || port === '3000') {
    return `http://${hostname}:${devPort}${path}`;
  }

  return path;
};

export const RAG_BASE_URL = getServiceUrl(
  process.env.REACT_APP_RAG_API_URL, 8100, '/api/rag'
);

export const OSINT_BASE_URL = getServiceUrl(
  process.env.REACT_APP_OSINT_API_URL, 8100, '/osint'
);

const api = axios.create({
  baseURL: API_URL,
  // Auth is an httpOnly cookie set by the backend on login — send it on every request.
  withCredentials: true,
});

api.interceptors.request.use(
  (config) => {
    config.headers['ngrok-skip-browser-warning'] = '69420';
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle 401s
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error?.config?.url || '';
    const isUploadRequest = url.includes('/uploads/cloudinary');
    const isAuthCheck = url.includes('/me') && !url.includes('/me/permissions') && !url.includes('/users');
    // Also treat exact trailing /me or /api/me as auth check
    const isMeCheck = /\/me\/?$/.test(url) || url === 'me' || url.endsWith('/me');
    const onLoginPage = typeof window !== 'undefined' && window.location.pathname === '/login';
    if (error.response && error.response.status === 401 && !isUploadRequest && !(isAuthCheck || isMeCheck) && !onLoginPage) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
