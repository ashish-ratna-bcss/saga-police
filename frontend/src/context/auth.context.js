import { useState, useEffect, createContext, useContext } from 'react';
import { authApi } from '../api/auth.api';
import { toast } from 'sonner';
import { sessionCache, AUTH_ME_CACHE_KEY } from '../lib/sessionCache';
import { applyThemeColor } from '../lib/theme';

import { resolvePublicAssetUrl } from '../lib/publicAssetUrl';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

const applyUserTheme = (me) => {
  if (!me) return;
  if (me.ui_mode === 'light' || me.ui_mode === 'dark') {
    document.documentElement.classList.toggle('dark', me.ui_mode === 'dark');
  }
  const colorVal = typeof me.theme_color === 'object' ? me.theme_color?.value : me.theme_color;
  if (colorVal) applyThemeColor(colorVal);

  const title = me.blurasagatitle || me.theme_name || 'DRISHTI';
  const desc = me.blurasagadescription || me.theme_description || 'Cyber Intelligence Platform';
  document.title = `${title} — ${desc}`;

  const logoPath = me.blurasagalogo || me.theme_logo;
  if (logoPath) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.getElementsByTagName('head')[0].appendChild(link);
    }
    link.href = resolvePublicAssetUrl(logoPath);
  }
};

const cacheUser = (me) => {
  sessionCache.set(AUTH_ME_CACHE_KEY, me, 10 * 60 * 1000);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => sessionCache.get(AUTH_ME_CACHE_KEY));
  const [loading, setLoading] = useState(!sessionCache.get(AUTH_ME_CACHE_KEY));

  const fetchMe = async ({ bypassCache = false } = {}) => {
    if (!bypassCache) {
      const cached = sessionCache.get(AUTH_ME_CACHE_KEY);
      if (cached?.sidebar) {
        setUser(cached);
        applyUserTheme(cached);
      }
    }

    const response = await authApi.getMe();
    const me = response.data;
    cacheUser(me);
    setUser(me);
    applyUserTheme(me);
    return me;
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        await fetchMe();
      } catch {
        sessionCache.clear(AUTH_ME_CACHE_KEY);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (username, password) => {
    try {
      const loginRes = await authApi.login(username, password);
      if (loginRes.data?.ui_mode || loginRes.data?.theme_color) {
        applyUserTheme({
          ui_mode: loginRes.data.ui_mode,
          theme_color: loginRes.data.theme_color,
        });
      }
      const me = await fetchMe({ bypassCache: true });
      toast.success('Logged in successfully');
      return me;
    } catch (error) {
      sessionCache.clear(AUTH_ME_CACHE_KEY);
      setUser(null);
      toast.error(error.response?.data?.message || 'Login failed');
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // best-effort
    }
    sessionCache.clear();
    setUser(null);
    toast.info('Logged out');
  };

  const updateUiMode = async (ui_mode) => {
    const response = await authApi.updateUiMode(ui_mode);
    const me = response.data;
    cacheUser(me);
    setUser(me);
    applyUserTheme(me);
    return me;
  };

  const updateThemeColor = async (theme_color) => {
    const response = await authApi.updateThemeColor(theme_color);
    const me = response.data;
    cacheUser(me);
    setUser(me);
    applyUserTheme(me);
    return me;
  };

  const updatePlatforms = async (allowed_platforms) => {
    const response = await authApi.updatePlatforms(allowed_platforms);
    const me = response.data;
    cacheUser(me);
    setUser(me);
    return me;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        loading,
        fetchMe,
        updateUiMode,
        updateThemeColor,
        updatePlatforms,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
