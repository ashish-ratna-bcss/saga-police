import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../lib/api';
import { AlertService } from '@/features/alerts/api/alertService';
import { toast } from 'sonner';
import { sessionCache, DASHBOARD_CACHE_KEY } from '../lib/sessionCache';

const DashboardContext = createContext(null);

const CACHE_DURATION = 60 * 1000; // 1 minute in-memory / session
const CACHE_KEY = 'dashboardCache_v2';

const readLocalDashboard = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (parsed?.data && parsed?.ts) return parsed;
  } catch (error) {
    console.error('Failed to read dashboard cache:', error);
  }
  return null;
};

export const DashboardProvider = ({ children }) => {
  const [dashboardData, setDashboardData] = useState(() => {
    const mem = sessionCache.get(DASHBOARD_CACHE_KEY);
    if (mem?.data) return mem.data;
    return readLocalDashboard()?.data || null;
  });
  const [lastFetchTime, setLastFetchTime] = useState(() => {
    const mem = sessionCache.get(DASHBOARD_CACHE_KEY);
    if (mem?.ts) return mem.ts;
    return readLocalDashboard()?.ts || null;
  });
  const [loading, setLoading] = useState(false);

  // Hydrate session memory from localStorage once on mount (state already seeded above)
  useEffect(() => {
    const local = readLocalDashboard();
    if (!local?.data || !local?.ts) return;
    if (!sessionCache.get(DASHBOARD_CACHE_KEY)) {
      sessionCache.set(DASHBOARD_CACHE_KEY, { data: local.data, ts: local.ts }, CACHE_DURATION);
    }
  }, []);

  const fetchDashboardData = useCallback(async (forceRefresh = false) => {
    // Return cached data if available and not expired
    if (!forceRefresh && dashboardData && lastFetchTime) {
      const timeSinceLastFetch = Date.now() - lastFetchTime;
      if (timeSinceLastFetch < CACHE_DURATION) {
        return dashboardData;
      }
    }

    // Prevent multiple simultaneous fetches
    if (loading) return dashboardData;

    const isColdStart = !dashboardData;
    if (isColdStart) setLoading(true);

    try {
      const optionalRequest = (promise) => promise.catch(() => null);
      const getGrievanceDashboardStats = async () => {
        try {
          return await api.get('/grievance-workflow/dashboard-stats');
        } catch (error) {
          if (error?.response?.status === 404) {
            return api.get('/grievances/dashboard-stats');
          }
          throw error;
        }
      };

      const [
        dashStatsRes,
        reportsStatsRes,
        grievancesStatsRes,
        poiStatsRes,
        eventsRes
      ] = await Promise.all([
        AlertService.getDashboardStats(),
        api.get('/reports/stats'),
        optionalRequest(getGrievanceDashboardStats()),
        optionalRequest(api.get('/poi/stats')),
        optionalRequest(api.get('/events'))
      ]);

      const { byPlatform, pendingByPlatform, viralByPlatform, severityByPlatform } = dashStatsRes.data;

      // Build alertData in the format the dashboard expects: { active: { all: N, twitter: N, ... }, ... }
      const statuses = ['active', 'acknowledged', 'escalated', 'false_positive'];
      const alertData = {};
      statuses.forEach(status => {
        alertData[status] = {};
        Object.keys(byPlatform).forEach(plat => {
          alertData[status][plat] = byPlatform[plat]?.[status] || 0;
        });
      });

      // Viral counts
      alertData.viral = viralByPlatform;

      // Severity breakdown (high/medium/low per platform)
      alertData.severity = severityByPlatform || {};

      // Pending report counts
      const alertPendingReportData = pendingByPlatform;

      // Reports from lightweight backend stats
      const reportData = reportsStatsRes.data?.byPlatform || {};

      // Grievances from lightweight backend stats
      const grievanceRaw = grievancesStatsRes?.data?.byPlatform || {};
      const grievanceData = Object.entries(grievanceRaw).reduce((acc, [platform, item]) => {
        const pending = Number(item?.pending) || 0;
        const escalated = Number(item?.escalated) || 0;
        const closed = Number(item?.closed ?? item?.resolved) || 0;
        const total = Number(item?.total) || (pending + escalated + closed);

        acc[platform] = {
          total,
          pending,
          escalated,
          closed
        };
        return acc;
      }, {});

      // Profiles (POI) summary
      const profilePlatforms = ['all', 'x', 'facebook', 'instagram', 'youtube', 'whatsapp'];
      const profileDataRaw = poiStatsRes?.data?.byPlatform || {};
      const profileData = profilePlatforms.reduce((acc, platform) => {
        const item = profileDataRaw?.[platform] || {};
        acc[platform] = {
          total: Number(item.total) || 0,
          active: Number(item.active) || 0,
          inactive: Number(item.inactive) || 0,
          today_added: Number(item.today_added) || 0,
          week_added: Number(item.week_added) || 0
        };
        return acc;
      }, {});

      // Events summary
      const eventsList = Array.isArray(eventsRes?.data) ? eventsRes.data : [];
      const eventTotals = eventsList.reduce(
        (acc, event) => {
          const status = String(event?.status || 'planned').toLowerCase();
          if (status === 'planned' || status === 'active' || status === 'paused' || status === 'archived') {
            acc[status] += 1;
          }
          acc.total += 1;
          return acc;
        },
        { total: 0, planned: 0, active: 0, paused: 0, archived: 0 }
      );

      const eventData = { 
        all: eventTotals,
        list: eventsList 
      };

      const newData = {
        alertData,
        alertPendingReportData,
        reportData,
        grievanceData,
        profileData,
        eventData
      };

      setDashboardData(newData);
      const ts = Date.now();
      setLastFetchTime(ts);
      sessionCache.set(DASHBOARD_CACHE_KEY, { data: newData, ts }, CACHE_DURATION);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: newData, ts }));
      } catch (error) {
        console.error('Failed to write dashboard cache:', error);
      }
      return newData;
    } catch (error) {
      toast.error('Failed to load dashboard data');
      console.error(error);
      return dashboardData; // Return cached data on error
    } finally {
      if (isColdStart) setLoading(false);
    }
  }, [dashboardData, lastFetchTime, loading]);

  const refreshDashboard = useCallback(() => {
    return fetchDashboardData(true);
  }, [fetchDashboardData]);

  return (
    <DashboardContext.Provider value={{
      dashboardData,
      loading,
      fetchDashboardData,
      refreshDashboard,
      hasCachedData: !!dashboardData
    }}>
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
};

export default DashboardContext;
