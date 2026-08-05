import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
// import { toast } from 'sonner'; // Disabled - using silent alert count only
import { useAuth } from '../contexts/AuthContext';

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
    const { user } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);
    const lastAlertIdRef = useRef(null);

    const fetchUnreadCount = useCallback(async (silent = false) => {
        if (!user) return;
        try {
            const res = await api.get('/alerts/unread');
            const { count, latest_alert } = res.data;

            // If we have a latest alert, update tracking (no popup - just increment count)
            if (latest_alert && latest_alert.id !== lastAlertIdRef.current) {
                lastAlertIdRef.current = latest_alert.id;
                // Toast notifications disabled - alert count badge shows new alerts
            }

            setUnreadCount(count);
        } catch (error) {
            // silent fail on polling errors
            console.error('Failed to fetch unread count', error);
        }
    }, [user]);

    const markAllRead = async () => {
        try {
            await api.put('/alerts/read');
            setUnreadCount(0);
        } catch (error) {
            console.error('Failed to mark read', error);
        }
    };

    // Poll every 30 seconds
    useEffect(() => {
        if (user) {
            fetchUnreadCount(true); // Initial fetch silent
            const interval = setInterval(() => fetchUnreadCount(), 30000);
            return () => clearInterval(interval);
        }
    }, [user, fetchUnreadCount]);

    return (
        <NotificationContext.Provider value={{ unreadCount, fetchUnreadCount, markAllRead }}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotification = () => useContext(NotificationContext);
