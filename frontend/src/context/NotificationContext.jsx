import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationService } from '../services/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });

  const isSupported = typeof window !== 'undefined' && 'Notification' in window;
  const notifiedIdsRef = useRef(new Set());
  const initialLoadRef = useRef(true);

  // Load seen IDs from session to prevent repeat popups on refresh
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('bfa_seen_notifications');
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.forEach((id) => notifiedIdsRef.current.add(id));
      }
    } catch {
      // Ignore storage error
    }
  }, []);

  const saveSeenIds = (idsSet) => {
    try {
      const arr = Array.from(idsSet).slice(-200); // keep recent 200
      sessionStorage.setItem('bfa_seen_notifications', JSON.stringify(arr));
    } catch {
      // Ignore storage error
    }
  };

  // Request browser notification permission
  const requestPermission = async () => {
    if (!isSupported) {
      addToast('Desktop notifications are not supported by this browser.', 'warning');
      return 'unsupported';
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        addToast('Desktop notifications enabled! You will be notified of important events.', 'success');
        // Show test greeting notification
        new Notification('BFA Apartments Management', {
          body: 'Desktop notifications are active. You will receive real-time operational alerts.',
          icon: '/favicon.ico',
        });
      } else if (result === 'denied') {
        addToast('Desktop notifications were blocked in your browser settings.', 'warning');
      }
      return result;
    } catch (err) {
      console.error('Failed to request notification permission:', err);
      return 'denied';
    }
  };

  // Fetch notifications and trigger browser popups for new unread items
  const fetchNotifications = useCallback(async (isBackground = false) => {
    if (!isAuthenticated) return;
    if (!isBackground) setLoading(true);

    try {
      const res = await notificationService.getAll({ pageSize: 30 });
      const items = res.data || [];
      const count = res.unreadCount !== undefined ? res.unreadCount : items.filter((n) => !n.is_read).length;

      setNotifications(items);
      setUnreadCount(count);

      // Deliver browser notifications for new unread events
      if (permission === 'granted' && isSupported) {
        items.forEach((item) => {
          if (!item.is_read && !notifiedIdsRef.current.has(item.id)) {
            notifiedIdsRef.current.add(item.id);

            // Do not popup all historic notifications on initial page load
            if (!initialLoadRef.current) {
              const osNotification = new Notification(item.title || 'BFA Alert', {
                body: item.message ? item.message.slice(0, 140) : 'New operational notification.',
                icon: '/favicon.ico',
                tag: `bfa-notif-${item.id}`,
              });

              osNotification.onclick = () => {
                window.focus();
                if (item.link_url) {
                  navigate(item.link_url);
                } else {
                  navigate('/app/notifications');
                }
              };
            }
          }
        });

        saveSeenIds(notifiedIdsRef.current);
      }

      initialLoadRef.current = false;
    } catch (err) {
      console.warn('Notification poll error:', err.message);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [isAuthenticated, permission, isSupported, navigate]);

  // Polling hook (every 30 seconds while logged in)
  useEffect(() => {
    if (!isAuthenticated) return;

    fetchNotifications(false);

    const interval = setInterval(() => {
      fetchNotifications(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [isAuthenticated, fetchNotifications]);

  const markAsRead = async (id) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
      addToast('All notifications marked as read.', 'success');
    } catch (err) {
      addToast('Failed to mark all as read.', 'error');
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        isSupported,
        permission,
        requestPermission,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

export default NotificationContext;
