/**
 * In-memory + sessionStorage cache for auth sidebar / dashboard.
 * Survives remounts within the same tab; cleared on logout.
 */

const memory = new Map();

const readSession = (key) => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.expires || parsed.expires < Date.now()) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
};

const writeSession = (key, data, ttlMs) => {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({ data, expires: Date.now() + ttlMs })
    );
  } catch {
    // quota / private mode — memory cache still works
  }
};

export const sessionCache = {
  get(key) {
    const mem = memory.get(key);
    if (mem) {
      if (mem.expires > Date.now()) return mem.data;
      memory.delete(key);
    }
    const fromSession = readSession(key);
    if (fromSession != null) {
      memory.set(key, { data: fromSession, expires: Date.now() + 60_000 });
    }
    return fromSession;
  },

  set(key, data, ttlMs = 5 * 60 * 1000) {
    memory.set(key, { data, expires: Date.now() + ttlMs });
    writeSession(key, data, ttlMs);
  },

  clear(key) {
    if (key) {
      memory.delete(key);
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      return;
    }
    memory.clear();
    try {
      sessionStorage.removeItem('auth:me');
      sessionStorage.removeItem('dashboard:stats');
    } catch {
      /* ignore */
    }
  },
};

export const AUTH_ME_CACHE_KEY = 'auth:me';
export const DASHBOARD_CACHE_KEY = 'dashboard:stats';
