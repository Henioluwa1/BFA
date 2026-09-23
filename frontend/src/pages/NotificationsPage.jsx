import React, { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { notificationService } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useNavigate } from 'react-router-dom';

export default function NotificationsPage() {
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await notificationService.getAll({
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        isRead: unreadOnly ? false : undefined,
      });
      setNotifications(res.data || []);
      setUnreadCount(res.unreadCount || 0);
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to load notifications.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [categoryFilter, unreadOnly]);

  const handleMarkRead = async (id) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      addToast('Marked as read', 'info');
    } catch (err) {
      addToast('Failed to mark notification as read.', 'error');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
      addToast('All notifications marked as read.', 'success');
    } catch (err) {
      addToast('Failed to mark all as read.', 'error');
    }
  };

  const handleNotificationClick = (notif) => {
    if (!notif.is_read) {
      handleMarkRead(notif.id);
    }
    if (notif.link_url) {
      navigate(notif.link_url);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🔔</span> Central Notifications Hub
          </h1>
          <p className="page-subtitle">
            System announcements, booking activities, security alerts, and operational directives.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {unreadCount > 0 && (
            <Badge status="danger">{unreadCount} Unread</Badge>
          )}
          <Button
            variant="secondary"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
          >
            ✓ Mark All as Read
          </Button>
          <Button variant="secondary" onClick={loadNotifications} disabled={loading}>
            {loading ? 'Refreshing...' : '↻ Refresh'}
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {['ALL', 'SECURITY', 'BOOKING', 'PAYMENT', 'COMMUNICATION', 'MAINTENANCE', 'SYSTEM'].map((cat) => (
              <button
                key={cat}
                className={`btn btn-sm ${categoryFilter === cat ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCategoryFilter(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            Show Unread Only
          </label>
        </div>
      </Card>

      {/* Notification Stream */}
      <Card title={`Notifications (${notifications.length})`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {notifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => handleNotificationClick(notif)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                padding: '1rem',
                borderRadius: '8px',
                background: notif.is_read ? 'rgba(255,255,255,0.02)' : 'rgba(59,130,246,0.08)',
                borderLeft: `4px solid ${
                  notif.priority === 'CRITICAL'
                    ? '#ef4444'
                    : notif.priority === 'HIGH'
                    ? '#f59e0b'
                    : notif.is_read
                    ? 'transparent'
                    : '#3b82f6'
                }`,
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <Badge
                    status={
                      notif.priority === 'CRITICAL'
                        ? 'danger'
                        : notif.priority === 'HIGH'
                        ? 'warning'
                        : 'neutral'
                    }
                  >
                    {notif.category}
                  </Badge>
                  <strong style={{ fontSize: '0.9375rem', color: notif.is_read ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                    {notif.title}
                  </strong>
                  {!notif.is_read && (
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
                  )}
                </div>
                <p style={{ margin: '0 0 0.35rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  {notif.message}
                </p>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {new Date(notif.created_at).toLocaleString()}
                  {notif.link_url && (
                    <span style={{ marginLeft: '1rem', color: 'var(--brand-accent)' }}>
                      Click to view linked resource ➔
                    </span>
                  )}
                </div>
              </div>

              {!notif.is_read && (
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMarkRead(notif.id);
                  }}
                  title="Mark as read"
                >
                  ✓ Mark Read
                </button>
              )}
            </div>
          ))}

          {notifications.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔕</div>
              No notifications matching current filters.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
