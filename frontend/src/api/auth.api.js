import apiHandler from './apiHandler';

/** Auth endpoints — login, session, theme */
export const authApi = {
  login: (username, password, { force = false } = {}) =>
    apiHandler.post('/login', { username, password, ...(force ? { force: true } : {}) }),

  logout: () => apiHandler.post('/logout'),

  getMe: () => apiHandler.get('/me'),

  updateUiMode: (ui_mode) =>
    apiHandler.patch('/me/ui-mode', { ui_mode }),

  updateThemeColor: (theme_color) =>
    apiHandler.patch('/me/theme-color', { theme_color }),

  updatePlatforms: (allowed_platforms) =>
    apiHandler.patch('/me/platforms', { allowed_platforms }),

  getSetupStatus: () => apiHandler.get('/auth/setup-status'),
};

export default authApi;
