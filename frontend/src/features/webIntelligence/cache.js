/**
 * Tiny in-memory TTL cache for Web Intelligence list/detail fetches (WI-16).
 * Not a React Query replacement — just avoids hammering Bluweb on expand/revisit.
 */

const store = new Map();

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cacheSet(key, value, ttlMs = 30_000) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function cacheInvalidate(prefixOrKey) {
  if (!prefixOrKey) {
    store.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key === prefixOrKey || key.startsWith(prefixOrKey)) {
      store.delete(key);
    }
  }
}

export const CACHE_TTL = {
  overview: 20_000,
  sourceDetail: 45_000,
  crawlArtifacts: 60_000,
  intelligence: 30_000,
};
