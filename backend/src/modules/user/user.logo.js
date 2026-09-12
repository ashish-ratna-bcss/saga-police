/**
 * Helpers for storing admin logos in users.logo_data (BYTEA), not on disk.
 */

const DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i;
const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5MB
/** Raster only — SVG can carry script and must not be served on public branding routes. */
const ALLOWED_LOGO_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

const normalizeLogoMime = (mime) => {
  const m = String(mime || '').toLowerCase().trim();
  if (m === 'image/jpg') return 'image/jpeg';
  return m;
};

const isAllowedLogoMime = (mime) => ALLOWED_LOGO_MIMES.has(normalizeLogoMime(mime));

const parseLogoInput = (raw) => {
  if (raw == null) return { kind: 'empty' };
  if (typeof raw !== 'string') return { kind: 'invalid', message: 'Logo must be a string' };

  const value = raw.trim();
  if (!value) return { kind: 'empty' };

  // Keep existing DB-served URL — no change to binary
  if (
    value.startsWith('/api/branding/') ||
    value.includes('/api/branding/') ||
    value === 'db:'
  ) {
    return { kind: 'unchanged' };
  }

  const match = value.match(DATA_URL_RE);
  if (match) {
    const mime = normalizeLogoMime(match[1]);
    if (!isAllowedLogoMime(mime)) {
      return {
        kind: 'invalid',
        message: 'Logo must be PNG, JPEG, WebP, or GIF (SVG not allowed)',
      };
    }
    let buffer;
    try {
      buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    } catch {
      return { kind: 'invalid', message: 'Invalid base64 logo data' };
    }
    if (!buffer.length) return { kind: 'invalid', message: 'Empty logo data' };
    if (buffer.length > MAX_LOGO_BYTES) {
      return { kind: 'invalid', message: 'Logo must be less than 5MB' };
    }
    return { kind: 'binary', buffer, mime };
  }

  if (
    value.startsWith('/files/') ||
    value.startsWith('/api/files/') ||
    value.startsWith('/blura_saga') ||
    value.startsWith('http://') ||
    value.startsWith('https://')
  ) {
    return { kind: 'legacy_path', path: value };
  }

  return { kind: 'invalid', message: 'Logo must be an uploaded image (data URL)' };
};

/** Prefer port-based logo URL for login branding */
const publicLogoUrl = ({ port, username, updatedAt } = {}) => {
  const v = updatedAt ? `v=${encodeURIComponent(new Date(updatedAt).getTime())}` : '';
  if (port) {
    return `/api/branding/logo?port=${encodeURIComponent(port)}${v ? `&${v}` : ''}`;
  }
  if (username) {
    return `/api/branding/logo?username=${encodeURIComponent(username)}${v ? `&${v}` : ''}`;
  }
  return '/blura_saga_logo.jpg';
};

module.exports = {
  parseLogoInput,
  publicLogoUrl,
  isAllowedLogoMime,
  normalizeLogoMime,
  ALLOWED_LOGO_MIMES,
  MAX_LOGO_BYTES,
};
