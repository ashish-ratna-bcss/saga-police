import tenantData from './tenantBranding.json';
import { BACKEND_URL } from './backendUrl';

export const DEFAULT_BLURA_SAGA = tenantData.default || {
  application_name: 'Blura Saga',
  username: 'default',
  title: 'BLURA SAGA',
  subtitle: 'Cyber Intelligence & Observability',
  logo: '/blura_saga_logo.jpg',
  description:
    'Next-generation Social Media Observation, Threat Monitoring & Cyber Intelligence Platform — built for real-time situational awareness and rapid investigation.',
};

/**
 * Determine the target username from param, URL query (?username, ?user, ?port),
 * or window.location.port mapped via tenantBranding.json.
 */
export function resolveTargetUsername(paramUsername) {
  const tenants = tenantData.tenants || [];

  let target = (paramUsername || '').toString().trim().toLowerCase();
  if (target) return target;

  if (typeof window !== 'undefined') {
    const searchParams = new URLSearchParams(window.location.search || '');

    // 1. Direct query param: ?port=3000
    const queryPort = searchParams.get('port');
    if (queryPort) {
      const p = parseInt(queryPort, 10);
      const matchedByPort = tenants.find((t) => t.port === p);
      if (matchedByPort?.username) return matchedByPort.username;
    }

    // 2. Direct query param: ?username=odisha or ?user=odisha or ?tenant=odisha
    const queryUser = (
      searchParams.get('username') ||
      searchParams.get('user') ||
      searchParams.get('tenant') ||
      ''
    ).trim().toLowerCase();
    if (queryUser) return queryUser;

    // 3. Port match from window.location.port (e.g. 3000, 3001, 3002)
    if (window.location.port) {
      const portNum = parseInt(window.location.port, 10);
      const matched = tenants.find((t) => t.port === portNum);
      if (matched?.username) return matched.username;
    }
  }

  return '';
}

/**
 * Synchronously retrieves tenant branding from tenantBranding.json.
 */
export function getTenantBranding(paramUsername) {
  const tenants = tenantData.tenants || [];
  const username = resolveTargetUsername(paramUsername);
  if (!username) return DEFAULT_BLURA_SAGA;
  const configEntry = tenants.find((t) => t.username.toLowerCase() === username.toLowerCase());
  if (configEntry) {
    return {
      ...DEFAULT_BLURA_SAGA,
      ...configEntry,
    };
  }
  return DEFAULT_BLURA_SAGA;
}

export const getInitialBranding = getTenantBranding;

/**
 * Promise-based getter for components expecting an async call.
 */
export async function fetchTenantBranding(paramUsername) {
  return getTenantBranding(paramUsername);
}

/**
 * Resolves logo URL (prepends backend origin if relative path from upload).
 */
export function getLogoUrl(logo) {
  if (!logo) return '/blura_saga_logo.jpg';
  if (
    logo.startsWith('http://') ||
    logo.startsWith('https://') ||
    logo.startsWith('blob:') ||
    logo.startsWith('data:')
  ) {
    return logo;
  }
  return `${BACKEND_URL}${logo}`;
}
