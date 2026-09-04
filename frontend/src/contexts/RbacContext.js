import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import api from '../lib/api';

const normalizeRoutePath = (value) => {
    if (!value || typeof value !== 'string') return '/';
    const withoutQuery = value.split('?')[0].split('#')[0];
    const path = (withoutQuery.replace(/\/+$/, '') || '/').toLowerCase();

    if (path.startsWith('/reports/generate/')) return '/reports';
    if (path.startsWith('/instagram-monitor/')) return '/instagram-monitor';
    if (path.startsWith('/person-of-interest/')) return '/person-of-interest';

    return path;
};

const RbacContext = createContext(null);

export const useRbac = () => {
    const context = useContext(RbacContext);
    if (!context) {
        throw new Error('useRbac must be used within RbacProvider');
    }
    return context;
};

export const RbacProvider = ({ children }) => {
    const { user } = useAuth();
    const [allowedPages, setAllowedPages] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchPermissions = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.get('/me/permissions');
            setAllowedPages(Array.isArray(response.data.allowed_pages) ? response.data.allowed_pages : []);
        } catch (error) {
            console.error('Failed to fetch permissions:', error);
            setAllowedPages([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!user) {
            setAllowedPages([]);
            setLoading(false);
            return;
        }

        // Prefer sidebar paths from /me (ACCESS_FEATURES), else allowed_pages / fetch
        if (Array.isArray(user.sidebar) && user.sidebar.length > 0) {
            setAllowedPages(user.sidebar.map((item) => item.path));
            setLoading(false);
            return;
        }

        if (user.allowed_pages && Array.isArray(user.allowed_pages)) {
            setAllowedPages(user.allowed_pages);
            setLoading(false);
            return;
        }

        fetchPermissions();
    }, [user, fetchPermissions]);

    const normalizedAllowedPages = useMemo(
        () => allowedPages.map((path) => normalizeRoutePath(path)),
        [allowedPages]
    );

    const refreshPermissions = useCallback(async () => {
        await fetchPermissions();
    }, [fetchPermissions]);

    const hasAccess = useCallback((pagePath) => {
        if (loading) return true;
        if (!user) return false;
        if (user.role === 'superadmin') return true;

        const normalizedPath = normalizeRoutePath(pagePath);
        if (normalizedAllowedPages.includes(normalizedPath)) return true;

        return normalizedAllowedPages.some((allowedPath) => (
            normalizedPath.startsWith(`${allowedPath}/`)
        ));
    }, [loading, user, normalizedAllowedPages]);

    // Page access = full feature access for that page (no separate feature catalog)
    const hasFeatureAccess = useCallback((pagePath) => hasAccess(pagePath), [hasAccess]);

    return (
        <RbacContext.Provider
            value={{
                allowedPages: normalizedAllowedPages,
                hasAccess,
                hasFeatureAccess,
                normalizeRoutePath,
                refreshPermissions,
                loading
            }}
        >
            {children}
        </RbacContext.Provider>
    );
};

export default RbacContext;
