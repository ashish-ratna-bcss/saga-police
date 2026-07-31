import axios from 'axios';

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
});

// Request interceptor to add token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
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
    if (error.response && error.response.status === 401 && !isUploadRequest) {
      // Token expired or invalid
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
