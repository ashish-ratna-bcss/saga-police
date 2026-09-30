/**
 * Backward-compatible re-export of the backend apiHandler.
 * Prefer: import apiHandler from '../api/apiHandler' or import { authApi } from '../api'
 */
export { default } from '../api/apiHandler';
export { BACKEND_URL } from './backendUrl';
export { default as api } from '../api/apiHandler';

/** Non-backend service URLs (OSINT / RAG) — kept here, not in apiHandler */
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

export { getServiceUrl };

