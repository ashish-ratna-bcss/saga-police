import { resolvePublicAssetUrl } from './publicAssetUrl';
import { BACKEND_URL } from './backendUrl';

export const DEFAULT_BLURA_SAGA = {
  title: 'BLURA SAGA',
  logo: '/blura_saga_logo.jpg',
  description:
    'Next-generation Social Media Observation, Threat Monitoring & Cyber Intelligence Platform — built for real-time situational awareness and rapid investigation.',
  port: null,
};

/** Current UI port (CRA :3000/:3001/:3002) or ?port= override */
export function resolveTargetPort() {
  if (typeof window === 'undefined') return null;

  const searchParams = new URLSearchParams(window.location.search || '');
  const queryPort = searchParams.get('port');
  if (queryPort) {
    const p = parseInt(queryPort, 10);
    if (Number.isInteger(p) && p > 0) return p;
  }

  if (window.location.port) {
    const p = parseInt(window.location.port, 10);
    if (Number.isInteger(p) && p > 0) return p;
  }

  return null;
}

export function resolveTargetHost() {
  if (typeof window === 'undefined') return '';
  return String(window.location.hostname || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
}

export function getInitialBranding() {
  return {
    ...DEFAULT_BLURA_SAGA,
    port: resolveTargetPort(),
  };
}

/** @deprecated use getInitialBranding */
export function getTenantBranding() {
  return getInitialBranding();
}

/**
 * Public login branding (no auth / no cookies).
 * GET /api/branding?port=3002 → { title, description, logo }
 */
export async function fetchTenantBranding() {
  const port = resolveTargetPort();
  const host = resolveTargetHost();
  const fallback = getInitialBranding();

  const params = new URLSearchParams();
  if (port) {
    params.set('port', String(port));
  } else if (host && host !== 'localhost' && host !== '127.0.0.1') {
    params.set('host', host);
  } else {
    return fallback;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/branding?${params.toString()}`, {
      method: 'GET',
      // Public endpoint — do not send cookies / Authorization
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    return {
      title: data.title || fallback.title,
      description: data.description || fallback.description,
      logo: data.logo || fallback.logo,
      port: data.port ?? port,
    };
  } catch {
    return fallback;
  }
}

/** Resolve logo path for <img src> (API logo links go to backend). */
export function getLogoUrl(logo) {
  if (!logo) return '/blura_saga_logo.jpg';
  if (typeof logo === 'string' && logo.startsWith('data:')) return logo;
  if (typeof logo === 'string' && /^https?:\/\//i.test(logo)) return logo;
  return resolvePublicAssetUrl(logo) || '/blura_saga_logo.jpg';
}
