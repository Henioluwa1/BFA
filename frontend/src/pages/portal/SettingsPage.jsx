import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { systemService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function SettingsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role);

  const [activeTab, setActiveTab] = useState('company'); // 'company' | 'reservations' | 'finance' | 'operations'
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  const [form, setForm] = useState({
    // Company
    company_name: 'BFA Apartments',
    company_email: 'info@bfa-apartments.com',
    company_phone: '+234 800 BFA APARTS',
    company_address: 'Plot 12, Victoria Island, Lagos, Nigeria',
    // Reservations
    require_deposit_percentage: '20',
    allow_overbooking: 'false',
    default_checkin_time: '14:00',
    default_checkout_time: '11:00',
    cancellation_grace_hours: '24',
    // Finance
    default_currency: 'NGN',
    vat_tax_rate: '7.5',
    default_agent_commission_rate: '10',
    security_deposit_fixed: '50000',
    // Operations
    system_timezone: 'Africa/Lagos',
    auto_dispatch_maintenance: 'true',
    low_inventory_alert_threshold: '2',
    portal_support_email: 'support@bfa-apartments.com',
  });

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await systemService.getSettings();
      const settingsMap = res.data?.settings || {};
      
      const flat = {};
      Object.values(settingsMap).forEach((categoryGroup) => {
        if (typeof categoryGroup === 'object' && categoryGroup !== null) {
          Object.assign(flat, categoryGroup);
        }
      });

      setForm((prev) => ({
        ...prev,
        ...flat,
      }));
      setLastSaved(new Date());
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to load system settings from server.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!isAdmin) {
      addToast('Administrative privileges required to modify system settings.', 'warning');
      return;
    }

    setSaving(true);
    try {
      await systemService.updateSettings({ settings: form });
      addToast('System settings saved and persisted successfully.', 'success');
      setLastSaved(new Date());
      loadSettings();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to update system settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span>⚙️</span> System Settings & Configuration
            <Badge status="success">PHASE 11 OPERATIONAL</Badge>
          </h1>
          <p className="page-subtitle">
            Configure company identity, reservation governance, financial standards, and operational parameters.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {lastSaved && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Saved: {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <Button variant="secondary" onClick={loadSettings} disabled={loading || saving}>
            ↻ Refresh
          </Button>
          {isAdmin && (
            <Button variant="primary" onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Saving...' : '💾 Save Settings'}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-nav" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
        <button
          className={`btn ${activeTab === 'company' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('company')}
          style={{ borderRadius: '6px 6px 0 0' }}
        >
          🏢 Company & Brand
        </button>
        <button
          className={`btn ${activeTab === 'reservations' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('reservations')}
          style={{ borderRadius: '6px 6px 0 0' }}
        >
          🏨 Reservation Policies
        </button>
        <button
          className={`btn ${activeTab === 'finance' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('finance')}
          style={{ borderRadius: '6px 6px 0 0' }}
        >
          💳 Financial & Currency
        </button>
        <button
          className={`btn ${activeTab === 'operations' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('operations')}
          style={{ borderRadius: '6px 6px 0 0' }}
        >
          🔌 Operations & Support
        </button>
      </div>

      <form onSubmit={handleSave}>
        {/* TAB 1: Company Profile */}
        {activeTab === 'company' && (
          <Card title="Company Profile & Legal Branding">
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              These details appear on official guest folios, PDF reservation vouchers, staff ID badges, and invoice headers.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1.25rem' }}>
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Legal Company Name
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={form.company_name}
                  onChange={(e) => handleChange('company_name', e.target.value)}
                  disabled={!isAdmin}
                  required
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Primary Corporate Email
                </label>
                <input
                  type="email"
                  className="form-control"
                  value={form.company_email}
                  onChange={(e) => handleChange('company_email', e.target.value)}
                  disabled={!isAdmin}
                  required
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Corporate Contact Phone
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={form.company_phone}
                  onChange={(e) => handleChange('company_phone', e.target.value)}
                  disabled={!isAdmin}
                  required
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Physical Headquarters Address
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={form.company_address}
                  onChange={(e) => handleChange('company_address', e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
            </div>
          </Card>
        )}

        {/* TAB 2: Reservation Policies */}
        {activeTab === 'reservations' && (
          <Card title="Reservation & Front-Desk Governance">
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Rules enforcing booking validations, deposit collection, and check-in/out operating schedules.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1.25rem' }}>
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Mandatory Deposit Rate (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="form-control"
                  value={form.require_deposit_percentage}
                  onChange={(e) => handleChange('require_deposit_percentage', e.target.value)}
                  disabled={!isAdmin}
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  Percentage required upfront to confirm a standard reservation.
                </small>
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Double-Booking / Overbooking Policy
                </label>
                <select
                  className="form-control"
                  value={form.allow_overbooking}
                  onChange={(e) => handleChange('allow_overbooking', e.target.value)}
                  disabled={!isAdmin}
                >
                  <option value="false">Strictly Prohibited (Zero Overbooking)</option>
                  <option value="true">Allowed (Manager Override Required)</option>
                </select>
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  Architectural standard mandates strict double-booking prevention.
                </small>
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Standard Check-in Time
                </label>
                <input
                  type="time"
                  className="form-control"
                  value={form.default_checkin_time}
                  onChange={(e) => handleChange('default_checkin_time', e.target.value)}
                  disabled={!isAdmin}
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Standard Check-out Time
                </label>
                <input
                  type="time"
                  className="form-control"
                  value={form.default_checkout_time}
                  onChange={(e) => handleChange('default_checkout_time', e.target.value)}
                  disabled={!isAdmin}
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Cancellation Notice Grace Period (Hours)
                </label>
                <input
                  type="number"
                  min="0"
                  className="form-control"
                  value={form.cancellation_grace_hours}
                  onChange={(e) => handleChange('cancellation_grace_hours', e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
            </div>
          </Card>
        )}

        {/* TAB 3: Financial Defaults */}
        {activeTab === 'finance' && (
          <Card title="Financial & Accounting Configurations">
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Tax calculations, base operational currency, and agent commission defaults.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1.25rem' }}>
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Base Currency Standard
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={form.default_currency}
                  readOnly
                  disabled
                  style={{ background: 'var(--bg-card)', color: 'var(--accent-gold)' }}
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  Base currency is strictly locked to Nigerian Naira (₦ / NGN).
                </small>
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Standard VAT Rate (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className="form-control"
                  value={form.vat_tax_rate}
                  onChange={(e) => handleChange('vat_tax_rate', e.target.value)}
                  disabled={!isAdmin}
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  Statutory Value Added Tax applied to guest bills.
                </small>
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Default Agent Commission Rate (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  className="form-control"
                  value={form.default_agent_commission_rate}
                  onChange={(e) => handleChange('default_agent_commission_rate', e.target.value)}
                  disabled={!isAdmin}
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Standard Security Deposit (₦)
                </label>
                <input
                  type="number"
                  step="1000"
                  min="0"
                  className="form-control"
                  value={form.security_deposit_fixed}
                  onChange={(e) => handleChange('security_deposit_fixed', e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
            </div>
          </Card>
        )}

        {/* TAB 4: Operations & Support */}
        {activeTab === 'operations' && (
          <Card title="Operations, Dispatch & Technical Support">
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Maintenance dispatch thresholds, emergency contacts, and server timezone settings.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1.25rem' }}>
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                  System Standard Timezone
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={form.system_timezone}
                  onChange={(e) => handleChange('system_timezone', e.target.value)}
                  disabled={!isAdmin}
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Automated Maintenance Dispatch
                </label>
                <select
                  className="form-control"
                  value={form.auto_dispatch_maintenance}
                  onChange={(e) => handleChange('auto_dispatch_maintenance', e.target.value)}
                  disabled={!isAdmin}
                >
                  <option value="true">Enabled (Auto-assign on unit checkout damage)</option>
                  <option value="false">Manual Approval Required</option>
                </select>
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Low Inventory Warning Threshold (Units)
                </label>
                <input
                  type="number"
                  min="1"
                  className="form-control"
                  value={form.low_inventory_alert_threshold}
                  onChange={(e) => handleChange('low_inventory_alert_threshold', e.target.value)}
                  disabled={!isAdmin}
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Dedicated Guest Support Email
                </label>
                <input
                  type="email"
                  className="form-control"
                  value={form.portal_support_email}
                  onChange={(e) => handleChange('portal_support_email', e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
            </div>
          </Card>
        )}

        {isAdmin && (
          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <Button variant="secondary" onClick={loadSettings} disabled={saving || loading}>
              Discard Changes
            </Button>
            <Button variant="primary" type="submit" disabled={saving || loading}>
              {saving ? 'Saving...' : '💾 Save Settings'}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
