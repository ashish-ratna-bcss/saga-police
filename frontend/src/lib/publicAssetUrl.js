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
      const brandingPath = u.pathname.startsWith('/api/branding/');
      // Rewrite loopback or portless branding/file URLs onto the current API origin
      if ((localHost && (filesPath || brandingPath)) || brandingPath) {
        const pathname =
          filesPath && u.pathname.startsWith('/files/')
            ? `/api${u.pathname}`
            : u.pathname;
        return `${BACKEND_URL}${pathname}${u.search}`;
      }
      return value;
    }
  } catch {
    // fall through
  }

  if (value.startsWith('/files/')) {
    return `${BACKEND_URL}/api${value}`;
  }
  if (value.startsWith('/api/')) {
    return `${BACKEND_URL}${value}`;
  }

  return value;
};

/** True when a stored report PDF URL still resolves (avoids stale QR → 404). */
export const isPublicFileReachable = async (rawUrl) => {
  const url = resolvePublicAssetUrl(rawUrl);
  if (!url || typeof url !== 'string') return false;
  try {
    const head = await fetch(url, { method: 'HEAD', mode: 'cors' });
    if (head.ok) return true;
    if (head.status === 405 || head.status === 501) {
      const ranged = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        mode: 'cors',
      });
      return ranged.ok || ranged.status === 206;
    }
    return false;
  } catch {
    return false;
  }
};
