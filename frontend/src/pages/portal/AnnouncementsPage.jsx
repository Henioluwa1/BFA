import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';
import { announcementService } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export default function AnnouncementsPage() {
  const { addToast } = useToast();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const [form, setForm] = useState({
    title: '',
    message: '',
    priority: 'MEDIUM',
    displayLocation: 'PUBLIC_LANDING',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  });

  const loadAnnouncements = async () => {
    setLoading(true);
    try {
      const res = await announcementService.getAll();
      setAnnouncements(res.data || []);
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to load announcements.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const handleToggle = async (id, currentStatus) => {
    try {
      await announcementService.toggle(id, !currentStatus);
      addToast(`Announcement #${id} status updated.`, 'success');
      loadAnnouncements();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to toggle announcement.', 'error');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      addToast('Title and message are required.', 'warning');
      return;
    }

    try {
      await announcementService.create({
        title: form.title.trim(),
        message: form.message.trim(),
        priority: form.priority,
        displayLocation: form.displayLocation,
        startDate: form.startDate,
        endDate: form.endDate,
      });
      addToast('Public announcement published successfully.', 'success');
      setCreateModalOpen(false);
      setForm({
        title: '',
        message: '',
        priority: 'MEDIUM',
        displayLocation: 'PUBLIC_LANDING',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      });
      loadAnnouncements();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to create announcement.', 'error');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📢</span> Public & Portal Announcement Banners
          </h1>
          <p className="page-subtitle">
            Configure dynamic broadcast banners displayed on the public landing page, booking engine, and staff portal.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="secondary" onClick={loadAnnouncements} disabled={loading}>
            {loading ? 'Refreshing...' : '↻ Refresh'}
          </Button>
          <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
            + New Announcement Banner
          </Button>
        </div>
      </div>

      <Card title="Announcement Banners">
        <Table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Banner Title & Message</th>
              <th>Display Placement</th>
              <th>Priority</th>
              <th>Active Period</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Toggle</th>
            </tr>
          </thead>
          <tbody>
            {announcements.map((ann) => (
              <tr key={ann.id}>
                <td>#{ann.id}</td>
                <td style={{ maxWidth: '300px' }}>
                  <strong style={{ display: 'block', color: 'var(--text-primary)' }}>{ann.title}</strong>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    {ann.message}
                  </span>
                </td>
                <td>
                  <Badge status="info">{ann.display_location}</Badge>
                </td>
                <td>
                  <Badge status={ann.priority === 'CRITICAL' ? 'danger' : ann.priority === 'HIGH' ? 'warning' : 'neutral'}>
                    {ann.priority}
                  </Badge>
                </td>
                <td style={{ fontSize: '0.8125rem' }}>
                  {new Date(ann.start_date).toLocaleDateString()} ➔ {new Date(ann.end_date).toLocaleDateString()}
                </td>
                <td>
                  <Badge status={ann.is_active ? 'success' : 'danger'}>
                    {ann.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </Badge>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Button
                    size="sm"
                    variant={ann.is_active ? 'danger' : 'success'}
                    onClick={() => handleToggle(ann.id, ann.is_active)}
                  >
                    {ann.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </td>
              </tr>
            ))}
            {announcements.length === 0 && (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                  No announcement banners configured.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      {/* CREATE MODAL */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        size="md"
        icon="📢"
        title="Create New Announcement Banner"
        subtitle="Configure a prominent broadcast banner across public landing or authenticated portal"
      >
        <form onSubmit={handleCreate}>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Banner Title *</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Welcome to BFA Apartments - Summer Booking Offer"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Banner Message Content *</label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Broadcast message displayed prominently across the selected location..."
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Display Location *</label>
              <select
                className="form-control"
                value={form.displayLocation}
                onChange={(e) => setForm({ ...form, displayLocation: e.target.value })}
              >
                <option value="PUBLIC_LANDING">Public Landing Page</option>
                <option value="ONLINE_BOOKING">Online Booking Flow</option>
                <option value="AUTHENTICATED_PORTAL">Staff Portal</option>
                <option value="ALL">All Application Portals</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priority Level *</label>
              <select
                className="form-control"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High Alert</option>
                <option value="CRITICAL">Critical Advisory</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
            <div className="form-group">
              <label className="form-label">Start Date *</label>
              <input
                type="date"
                className="form-control"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">End Date *</label>
              <input
                type="date"
                className="form-control"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button type="button" variant="secondary" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Publish Banner
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
