import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { ShieldCheck, AlertCircle, RefreshCw, CheckCircle, Clock } from '../ui/Icons';
import { workforceService } from '../../services/api';

export default function AttendancePolicyModal({
  isOpen,
  onClose,
  properties = [],
  currentUser,
  activePropertyId,
  onSuccess,
}) {
  const isOpsManager = ['OPERATIONS_MANAGER', 'MANAGER'].includes(currentUser?.role);
  const defaultPropId = isOpsManager
    ? (currentUser?.propertyId || currentUser?.property_id || activePropertyId || '1')
    : (activePropertyId !== 'all' ? activePropertyId : '1');

  const [selectedPropertyId, setSelectedPropertyId] = useState(defaultPropId);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [geoLocating, setGeoLocating] = useState(false);

  const [policy, setPolicy] = useState({
    allow_mobile: true,
    allow_gps: true,
    require_gps: true,
    allow_kiosk: true,
    allow_manager_assisted: true,
    geofence_lat: '6.42810000',
    geofence_lng: '3.42190000',
    geofence_radius_meters: 200,
    grace_period_minutes: 15,
    overtime_threshold_hours: '40.00',
    missing_punch_threshold_hours: '12.00',
    delegated_leave_limit_days: 14,
    updated_at: null,
  });

  // Fetch policy when property changes
  useEffect(() => {
    if (!isOpen) return;

    async function loadPolicy() {
      setLoading(true);
      setError(null);
      try {
        const propId = selectedPropertyId !== 'global' ? selectedPropertyId : null;
        const res = await workforceService.getPolicy(propId);
        const data = res?.data || res;
        if (data) {
          setPolicy({
            allow_mobile: Boolean(data.allow_mobile),
            allow_gps: Boolean(data.allow_gps),
            require_gps: Boolean(data.require_gps),
            allow_kiosk: Boolean(data.allow_kiosk),
            allow_manager_assisted: Boolean(data.allow_manager_assisted),
            geofence_lat: data.geofence_lat || '6.42810000',
            geofence_lng: data.geofence_lng || '3.42190000',
            geofence_radius_meters: data.geofence_radius_meters ?? 200,
            grace_period_minutes: data.grace_period_minutes ?? 15,
            overtime_threshold_hours: data.overtime_threshold_hours || '40.00',
            missing_punch_threshold_hours: data.missing_punch_threshold_hours || '12.00',
            delegated_leave_limit_days: data.delegated_leave_limit_days ?? 14,
            updated_at: data.updated_at || null,
          });
        }
      } catch (err) {
        console.error('Failed to load attendance policy:', err);
        setError(err.message || 'Error loading attendance policy');
      } finally {
        setLoading(false);
      }
    }

    loadPolicy();
  }, [isOpen, selectedPropertyId]);

  // Capture current GPS coordinates
  const handleCaptureCurrentGps = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by this browser.');
      return;
    }
    setGeoLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPolicy((prev) => ({
          ...prev,
          geofence_lat: pos.coords.latitude.toFixed(8),
          geofence_lng: pos.coords.longitude.toFixed(8),
        }));
        setGeoLocating(false);
      },
      (err) => {
        alert(`Failed to retrieve current location: ${err.message}`);
        setGeoLocating(false);
      },
      { timeout: 8000 }
    );
  };

  const handleSavePolicy = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const propId = selectedPropertyId !== 'global' ? Number(selectedPropertyId) : null;
      const payload = {
        property_id: propId,
        allow_mobile: policy.allow_mobile ? 1 : 0,
        allow_gps: policy.allow_gps ? 1 : 0,
        require_gps: policy.require_gps ? 1 : 0,
        allow_kiosk: policy.allow_kiosk ? 1 : 0,
        allow_manager_assisted: policy.allow_manager_assisted ? 1 : 0,
        geofence_lat: parseFloat(policy.geofence_lat),
        geofence_lng: parseFloat(policy.geofence_lng),
        geofence_radius_meters: parseInt(policy.geofence_radius_meters, 10),
        grace_period_minutes: parseInt(policy.grace_period_minutes, 10),
        overtime_threshold_hours: parseFloat(policy.overtime_threshold_hours),
        missing_punch_threshold_hours: parseFloat(policy.missing_punch_threshold_hours),
        delegated_leave_limit_days: parseInt(policy.delegated_leave_limit_days, 10),
      };

      await workforceService.updatePolicy(propId, payload);
      if (onSuccess) onSuccess('Attendance policy updated successfully!');
      onClose();
    } catch (err) {
      console.error('Failed to save policy:', err);
      setError(err.message || 'Failed to save attendance policy.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Attendance Policy Configuration"
      subtitle="Configure geofence enforcement, punch methods, and punctuality rules"
      size="lg"
    >
      <form onSubmit={handleSavePolicy} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {error && (
          <div
            style={{
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ef4444',
              color: '#ef4444',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Scope Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem 1rem',
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Target Property:</span>
            <select
              className="input-field"
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              disabled={isOpsManager}
              style={{ width: 'auto', minWidth: '180px', height: '34px', fontSize: '0.82rem' }}
            >
              {!isOpsManager && <option value="global">🌐 Global Default Policy</option>}
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name || `Property #${p.id}`}</option>
              ))}
            </select>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {policy.updated_at ? `Last saved: ${new Date(policy.updated_at).toLocaleString()}` : 'Default policy'}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={20} className="spin-animation" style={{ color: 'var(--primary-color, #10b981)' }} />
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>Loading policy configuration...</div>
          </div>
        ) : (
          <>
            {/* 1. Punch Methods Allowed */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                1. Allowed Attendance Punch Channels
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '0.65rem',
                  padding: '0.85rem',
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.82rem' }}>
                  <input
                    type="checkbox"
                    checked={policy.allow_mobile}
                    onChange={(e) => setPolicy({ ...policy, allow_mobile: e.target.checked })}
                  />
                  <span>Mobile & Web Attendance</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.82rem' }}>
                  <input
                    type="checkbox"
                    checked={policy.allow_gps}
                    onChange={(e) => setPolicy({ ...policy, allow_gps: e.target.checked })}
                  />
                  <span>GPS Location Capture</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', fontSize: '0.82rem' }}>
                  <input
                    type="checkbox"
                    checked={policy.require_gps}
                    onChange={(e) => setPolicy({ ...policy, require_gps: e.target.checked })}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <span><strong>Require Geofence Verification</strong></span>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Flag & review punches outside perimeter (Punctuality decoupled)
                    </div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.82rem' }}>
                  <input
                    type="checkbox"
                    checked={policy.allow_kiosk}
                    onChange={(e) => setPolicy({ ...policy, allow_kiosk: e.target.checked })}
                  />
                  <span>Property Kiosk Terminals</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.82rem' }}>
                  <input
                    type="checkbox"
                    checked={policy.allow_manager_assisted}
                    onChange={(e) => setPolicy({ ...policy, allow_manager_assisted: e.target.checked })}
                  />
                  <span>Manager-Assisted Punches</span>
                </label>
              </div>
            </div>

            {/* 2. Geofence Boundary Controls */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  2. Geofence Perimeter & Property Coordinates
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCaptureCurrentGps}
                  loading={geoLocating}
                  style={{ fontSize: '0.72rem', height: '28px' }}
                >
                  📍 Capture Current GPS
                </Button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.75rem',
                  padding: '0.85rem',
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div>
                  <label className="input-label" style={{ fontSize: '0.75rem' }}>Center Latitude</label>
                  <input
                    type="number"
                    step="0.00000001"
                    className="input-field"
                    value={policy.geofence_lat}
                    onChange={(e) => setPolicy({ ...policy, geofence_lat: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="input-label" style={{ fontSize: '0.75rem' }}>Center Longitude</label>
                  <input
                    type="number"
                    step="0.00000001"
                    className="input-field"
                    value={policy.geofence_lng}
                    onChange={(e) => setPolicy({ ...policy, geofence_lng: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="input-label" style={{ fontSize: '0.75rem' }}>Allowed Radius (Meters)</label>
                  <input
                    type="number"
                    min="50"
                    max="5000"
                    step="25"
                    className="input-field"
                    value={policy.geofence_radius_meters}
                    onChange={(e) => setPolicy({ ...policy, geofence_radius_meters: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>

            {/* 3. Punctuality, Overtime & Delegation Thresholds */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                3. Punctuality, Overtime & Leave Approval Limits
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.75rem',
                  padding: '0.85rem',
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div>
                  <label className="input-label" style={{ fontSize: '0.75rem' }}>Lateness Grace Period (Mins)</label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    className="input-field"
                    value={policy.grace_period_minutes}
                    onChange={(e) => setPolicy({ ...policy, grace_period_minutes: e.target.value })}
                    required
                  />
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Punches after this are flagged as LATE
                  </div>
                </div>

                <div>
                  <label className="input-label" style={{ fontSize: '0.75rem' }}>Weekly Overtime Baseline (Hrs)</label>
                  <input
                    type="number"
                    min="20"
                    max="60"
                    step="1"
                    className="input-field"
                    value={policy.overtime_threshold_hours}
                    onChange={(e) => setPolicy({ ...policy, overtime_threshold_hours: e.target.value })}
                    required
                  />
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Standard full-time threshold
                  </div>
                </div>

                <div>
                  <label className="input-label" style={{ fontSize: '0.75rem' }}>Missing Punch Threshold (Hrs)</label>
                  <input
                    type="number"
                    min="4"
                    max="24"
                    step="1"
                    className="input-field"
                    value={policy.missing_punch_threshold_hours}
                    onChange={(e) => setPolicy({ ...policy, missing_punch_threshold_hours: e.target.value })}
                    required
                  />
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Hours before unclosed punch flags alert
                  </div>
                </div>

                <div>
                  <label className="input-label" style={{ fontSize: '0.75rem' }}>Delegated Leave Authority (Days)</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    className="input-field"
                    value={policy.delegated_leave_limit_days}
                    onChange={(e) => setPolicy({ ...policy, delegated_leave_limit_days: e.target.value })}
                    required
                  />
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    &gt;{policy.delegated_leave_limit_days} days requires Admin escalation
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving} disabled={loading}>
            Save Policy Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

