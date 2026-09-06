import axios from 'axios';
import { BACKEND_URL } from '../lib/backendUrl';

export { BACKEND_URL };

/** Global backend axios instance — cookie auth + shared interceptors */
const apiHandler = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  withCredentials: true,
});

apiHandler.interceptors.request.use(
  (config) => {
    config.headers['ngrok-skip-browser-warning'] = '69420';
    return config;
  },
  (error) => Promise.reject(error)
);

apiHandler.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error?.config?.url || '';
    const isUploadRequest = url.includes('/uploads/cloudinary');
    const isAuthCheck =
      url.includes('/me') && !url.includes('/me/permissions') && !url.includes('/users');
    const isMeCheck = /\/me\/?$/.test(url) || url === 'me' || url.endsWith('/me');
    const onLoginPage =
      typeof window !== 'undefined' && window.location.pathname === '/login';

    if (
      error.response &&
      error.response.status === 401 &&
      !isUploadRequest &&
      !(isAuthCheck || isMeCheck) &&
      !onLoginPage
    ) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiHandler;
