/**
 * Normalizes a file URL (such as grievance PDF or uploaded asset)
 * ensuring it routes to /api/files/... and adopts the current host/origin
 * even if stored with a legacy or different tenant domain (e.g. odisha.blurasaga.com -> delhipolice.blurasaga.com).
 */
export const toApiFilesUrl = (rawUrl) => {
  if (!rawUrl) return '';
  const value = String(rawUrl).trim();
  if (!value) return '';

  const rewritePath = (pathname) => (pathname.startsWith('/files/') ? `/api${pathname}` : pathname);

  if (value.startsWith('/')) {
    const apiPath = rewritePath(value);
    return typeof window !== 'undefined' ? `${window.location.origin}${apiPath}` : apiPath;
  }

  try {
    const parsed = new URL(value);
    const pathname = rewritePath(parsed.pathname);

    // If it points to any blurasaga.com domain or localhost/IP, always bind to current window origin
    if (
      typeof window !== 'undefined' &&
      (parsed.hostname.endsWith('blurasaga.com') ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '100.49.109.96')
    ) {
      return `${window.location.origin}${pathname}${parsed.search}`;
    }

    parsed.pathname = pathname;
    return parsed.toString();
  } catch {
    return value;
  }
};

export default toApiFilesUrl;
