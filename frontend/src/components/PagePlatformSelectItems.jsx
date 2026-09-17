import React from 'react';
import { SelectItem } from './ui/select';
import { usePagePlatforms } from '../hooks/usePagePlatforms';

const canonicalSlug = (value) => {
  const s = String(value || '')
    .trim()
    .toLowerCase();
  if (!s) return '';
  return s === 'twitter' ? 'x' : s;
};

/**
 * SelectItem list for shadcn Select — labels from DB `name`.
 */
export function PagePlatformSelectItems({
  page = null,
  includeAll = true,
  allLabel = 'All platforms',
  valueAsTwitter = false,
}) {
  const { platforms, loading } = usePagePlatforms(page, { toastOnError: false });
  if (loading && !platforms.length) {
    return includeAll ? <SelectItem value="all">{allLabel}</SelectItem> : null;
  }
  return (
    <>
      {includeAll ? <SelectItem value="all">{allLabel}</SelectItem> : null}
      {platforms.map((row) => {
        const slug = canonicalSlug(row.slug);
        const value = valueAsTwitter && slug === 'x' ? 'twitter' : slug;
        return (
          <SelectItem key={value} value={value}>
            {row.name || value}
          </SelectItem>
        );
      })}
    </>
  );
}

/**
 * Native <option> list for plain <select> — labels from DB `name`.
 */
export function PagePlatformOptions({
  page = null,
  includeAll = true,
  allLabel = 'All Platforms',
  valueAsTwitter = false,
}) {
  const { platforms, loading } = usePagePlatforms(page, { toastOnError: false });
  if (loading && !platforms.length) {
    return includeAll ? <option value="all">{allLabel}</option> : null;
  }
  return (
    <>
      {includeAll ? <option value="all">{allLabel}</option> : null}
      {platforms.map((row) => {
        const slug = canonicalSlug(row.slug);
        const value = valueAsTwitter && slug === 'x' ? 'twitter' : slug;
        return (
          <option key={value} value={value}>
            {row.name || value}
          </option>
        );
      })}
    </>
  );
}

export default PagePlatformSelectItems;
