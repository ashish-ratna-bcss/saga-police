/**
 * Resolve stored logo / upload URLs for <img src>.
 * Uploads are often saved as localhost absolute URLs during local admin setup;
 * rewrite those (and relative /files paths) to the current API origin.
 */
import { BACKEND_URL } from './backendUrl';

export const resolvePublicAssetUrl = (raw) => {
  if (!raw || typeof raw !== 'string') return raw;
  const value = raw.trim();
  if (!value) return value;
  if (value.startsWith('data:') || value.startsWith('blob:')) return value;

  try {
    if (/^https?:\/\//i.test(value)) {
      const u = new URL(value);
      const localHost = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
      const filesPath =
        u.pathname.startsWith('/files/') || u.pathname.startsWith('/api/files/');
      if (localHost && filesPath) {
        return `${BACKEND_URL}${u.pathname}${u.search}`;
      }
      return value;
    }
  } catch {
    // fall through
  }

  if (value.startsWith('/files/') || value.startsWith('/api/files/')) {
    return `${BACKEND_URL}${value}`;
  }

  return value;
};
