import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { socialProfilesApi } from '../api/socialProfiles.api';

const canonicalSlug = (value) => {
  const s = String(value || '')
    .trim()
    .toLowerCase();
  if (!s) return '';
  return s === 'twitter' ? 'x' : s;
};

/**
 * Load tenant platforms for a page (DB ∩ pagePlatforms.json ∩ user RBAC).
 * Never invents platforms on failure — empty list + error.
 *
 * @param {string|null} page - e.g. 'grievances' | 'alerts' | 'events' | null for all active
 * @param {{ all?: boolean, toastOnError?: boolean }} [opts]
 */
export function usePagePlatforms(page = null, opts = {}) {
  const toastOnError = opts.toastOnError !== false;
  const includeInactive = Boolean(opts.all);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = {};
        if (page) params.page = page;
        if (includeInactive) params.all = 1;
        const res = await socialProfilesApi.listPlatforms(params);
        if (cancelled) return;
        const rows = Array.isArray(res.data) ? res.data : [];
        setPlatforms(rows);
      } catch (err) {
        if (cancelled) return;
        setPlatforms([]);
        setError(err);
        if (toastOnError) {
          toast.error(
            err?.response?.data?.error || err?.message || 'Failed to load platforms'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, includeInactive, toastOnError]);

  const slugs = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const row of platforms) {
      const slug = canonicalSlug(row?.slug);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      out.push(slug);
    }
    return out;
  }, [platforms]);

  return { platforms, slugs, loading, error };
}

export default usePagePlatforms;
