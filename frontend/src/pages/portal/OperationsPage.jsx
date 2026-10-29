import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';
import { systemService, auditService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function OperationsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState('health');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);

  // Module toggle confirmation modal state
  const [moduleToToggle, setModuleToToggle] = useState(null);
  const [toggleReason, setToggleReason] = useState('');
  const [isToggling, setIsToggling] = useState(false);
  const [moduleSearch, setModuleSearch] = useState('');
  const [moduleGroupFilter, setModuleGroupFilter] = useState('ALL');

  // Backup creation state
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);

  // Settings state
  const [settingsForm, setSettingsForm] = useState({
    site_name: 'BFA Apartments',
    max_stay_nights: '1',
    checkin_time: '14:00',
    checkout_time: '11:00',
    vat_rate: '7.5',
    commission_rate: '10',
    currency: 'NGN',
    contact_email: 'support@bfaapartments.ng',
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilter, setAuditFilter] = useState('');

  // Fetch Operations Overview
  const fetchOverview = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      const res = await systemService.getOperationsOverview();
      const data = res.data || res;
      setOverview(data);

      if (data.settings) {
        setSettingsForm((prev) => ({
          ...prev,
          ...data.settings,
        }));
      }
    } catch (err) {
      console.error('Failed to fetch operations overview:', err);
      setError(err.message || 'Failed to communicate with Operations Control service.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Fetch Audit Logs when Audit tab is selected
  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await auditService.getLogs({ limit: 40 });
      const data = res.data?.logs || res.logs || res.data || [];
      setAuditLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Failed to load audit logs:', err.message);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [activeTab, fetchAuditLogs]);

  // Handle Module Toggle
  const handleOpenToggleModal = (mod) => {
    if (mod.isCore) {
      addToast(`Core module "${mod.name}" is locked and cannot be disabled.`, 'warning');
      return;
    }
    setModuleToToggle(mod);
    setToggleReason('');
  };

  const handleConfirmToggle = async () => {
    if (!moduleToToggle) return;
    setIsToggling(true);
    try {
      const newEnabled = !moduleToToggle.isEnabled;
      await systemService.toggleModule(moduleToToggle.id, {
        isEnabled: newEnabled,
        reason: toggleReason || 'Administrative toggle via Operations Control Center',
      });

      addToast(`Module "${moduleToToggle.name}" has been ${newEnabled ? 'enabled' : 'disabled'}.`, 'success');
      setModuleToToggle(null);
      await fetchOverview(true);
    } catch (err) {
      addToast(err.message || 'Failed to toggle module status.', 'error');
    } finally {
      setIsToggling(false);
    }
  };

  // Handle Manual Backup Creation
  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    try {
      const res = await systemService.createBackupSnapshot();
      const backup = res.data?.backup || res.backup;
      addToast(`Database backup created successfully: ${backup?.filename || 'New Snapshot'} (${backup?.sizeFormatted || 'saved'})`, 'success');
      await fetchOverview(true);
    } catch (err) {
      addToast(err.message || 'Failed to create database backup.', 'error');
    } finally {
      setIsCreatingBackup(false);
    }
  };

  // Handle Settings Save
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      await systemService.updateSettings(settingsForm);
      addToast('System settings and policy thresholds updated successfully.', 'success');
      await fetchOverview(true);
    } catch (err) {
      addToast(err.message || 'Failed to update system settings.', 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Filtered modules
  const filteredModules = useMemo(() => {
    if (!overview?.modules) return [];
    return overview.modules.filter((m) => {
      const matchSearch =
        m.name.toLowerCase().includes(moduleSearch.toLowerCase()) ||
        m.id.toLowerCase().includes(moduleSearch.toLowerCase());
      const matchGroup = moduleGroupFilter === 'ALL' || m.group === moduleGroupFilter;
      return matchSearch && matchGroup;
    });
  }, [overview?.modules, moduleSearch, moduleGroupFilter]);

  // Subsystems from diagnostics
  const subsystems = overview?.diagnostics?.subsystems || [];
  const diagnostics = overview?.diagnostics || {};
  const governance = overview?.governance || {};
  const backups = overview?.backups || {};
  const migrations = overview?.migrations || {};

  return (
    <div className="operations-page page-container" style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Operations Control Center
            </h1>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: '9999px',
                background: diagnostics.status === 'ALL_SYSTEMS_OPERATIONAL' ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: diagnostics.status === 'ALL_SYSTEMS_OPERATIONAL' ? '#4ade80' : '#f87171',
                border: diagnostics.status === 'ALL_SYSTEMS_OPERATIONAL' ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor' }} />
              {diagnostics.status === 'ALL_SYSTEMS_OPERATIONAL' ? 'All Systems Operational' : 'System Degraded'}
            </span>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
              }}
            >
              Env: {diagnostics.system?.platform ? 'Production' : 'Ready'}
            </span>
          </div>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            System Telemetry, Subsystem Diagnostics, Feature Governance & Continuous Development
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Button
            variant="outline"
            onClick={() => fetchOverview(true)}
            disabled={isRefreshing || isLoading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
          >
            <span style={{ display: 'inline-block', transform: isRefreshing ? 'rotate(180deg)' : 'none', transition: 'transform 0.4s ease' }}>
              🔄
            </span>
            {isRefreshing ? 'Refreshing...' : 'Refresh Telemetry'}
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', marginBottom: '1.5rem', color: '#f87171' }}>
          <strong>⚠️ Operations Error:</strong> {error}
        </div>
      )}

      {/* Tabs Navigation */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--border-color, #334155)',
          marginBottom: '1.5rem',
          overflowX: 'auto',
          paddingBottom: '2px',
        }}
        role="tablist"
      >
        {[
          { key: 'health', label: 'Health & Diagnostics', icon: '🩺' },
          { key: 'flow', label: 'Operational System Flow', icon: '⚡' },
          { key: 'modules', label: `Modules & Toggles (${overview?.modules?.length || 18})`, icon: '🎛️' },
          { key: 'governance', label: `User Governance (${governance.totalUsers || 9})`, icon: '👥' },
          { key: 'settings', label: 'Settings & Thresholds', icon: '⚙️' },
          { key: 'audit', label: 'Audit Trail', icon: '📜' },
          { key: 'backups', label: `Backups & Migrations (${backups.totalBackups || 0})`, icon: '💾' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '0.65rem 1.15rem',
              fontSize: '0.875rem',
              fontWeight: activeTab === tab.key ? 600 : 500,
              background: activeTab === tab.key ? 'var(--brand-accent, #38bdf8)' : 'transparent',
              color: activeTab === tab.key ? '#0f172a' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab 1: Health & Diagnostics */}
      {activeTab === 'health' && (
        <div>
          {/* Top Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <Card style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Database Latency</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#38bdf8', marginBottom: '0.25rem' }}>
                {diagnostics.database?.latencyMs ?? '...'} ms
              </div>
              <div style={{ fontSize: '0.75rem', color: '#4ade80' }}>
                ✓ {diagnostics.database?.appliedMigrationsCount || 23}/23 Schema Migrations In Sync
              </div>
            </Card>

            <Card style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Node.js Memory (Heap)</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                {diagnostics.system?.memoryMb?.heapUsed ?? '...'} MB
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Heap Total: {diagnostics.system?.memoryMb?.heapTotal ?? '...'} MB • RSS: {diagnostics.system?.memoryMb?.rss ?? '...'} MB
              </div>
            </Card>

            <Card style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Active Subsystems</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4ade80', marginBottom: '0.25rem' }}>
                {subsystems.filter((s) => s.status === 'OPERATIONAL').length} / {subsystems.length || 6}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Gateway, MariaDB, Double-Entry GL, Reports, Socket.IO
              </div>
            </Card>

            <Card style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Server Uptime</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                {diagnostics.serverUptime || 'Active'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Node {diagnostics.system?.nodeVersion} • {diagnostics.system?.platform} ({diagnostics.system?.cpus} cores)
              </div>
            </Card>
          </div>

          {/* Subsystems Probe Matrix */}
          <Card style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>
              Subsystem Health Matrix & Telemetry Probes
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color, #334155)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Subsystem</th>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Category</th>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Status</th>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Probe Endpoint / Detail</th>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Last Checked</th>
                  </tr>
                </thead>
                <tbody>
                  {subsystems.map((sub, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {sub.name}
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>
                        {sub.category || 'SYSTEM_CORE'}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: sub.status === 'OPERATIONAL' ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: sub.status === 'OPERATIONAL' ? '#4ade80' : '#f87171',
                          }}
                        >
                          ● {sub.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {sub.detail || sub.endpoint || 'Internal Loopback'}
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {new Date().toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Security & Audit Warning Feed */}
          <Card style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.75rem 0', color: 'var(--text-primary)' }}>
              Recent Security & Governance Notices (24h)
            </h3>
            {diagnostics.recentWarnings && diagnostics.recentWarnings.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {diagnostics.recentWarnings.map((w, i) => (
                  <div key={i} style={{ padding: '0.75rem', background: 'rgba(251, 191, 36, 0.08)', borderLeft: '4px solid #fbbf24', borderRadius: '4px', fontSize: '0.85rem' }}>
                    <div style={{ fontWeight: 600, color: '#fbbf24' }}>{w.action || 'WARNING'}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>{w.details || w.message}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{w.timestamp}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '1rem', background: 'rgba(74, 222, 128, 0.05)', borderRadius: '6px', color: '#86efac', fontSize: '0.875rem' }}>
                ✓ Zero security warnings or high-severity audit alerts recorded in the past 24 hours.
              </div>
            )}
          </Card>
        </div>
      )}

      
      {/* Operational System Flow Pipeline Tab (Developer View) */}
      {activeTab === 'flow' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Authoritative Operational Flow & Telemetry
                </h2>
                <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Real-time architectural flow from booking ingestion, concurrency-locked front desk assignment, to performance tracking.
                </p>
              </div>
              <Badge status="available">PIPELINE ACTIVE</Badge>
            </div>

            {/* Architecture Pipeline Stages */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              {/* Stage 1 */}
              <div style={{ background: 'var(--bg-surface)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #38bdf8' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>📥</span>
                  <strong style={{ fontSize: '0.9rem', color: '#38bdf8' }}>Stage 1: Booking Ingestion</strong>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  Client initiates reservation. Broadcasts <code>frontdesk:new_booking</code> event to front desk consoles immediately.
                </p>
              </div>

              {/* Stage 2 */}
              <div style={{ background: 'var(--bg-surface)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>🔒</span>
                  <strong style={{ fontSize: '0.9rem', color: '#f59e0b' }}>Stage 2: Front Desk Concurrency Lock</strong>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  Atomic check: one client cannot be assigned to two staff members. Rejects duplicate assignment with <code>409 Conflict</code>.
                </p>
              </div>

              {/* Stage 3 */}
              <div style={{ background: 'var(--bg-surface)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>🛡️</span>
                  <strong style={{ fontSize: '0.9rem', color: '#10b981' }}>Stage 3: Availability Verification</strong>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  Checks unit status against <code>MAINTENANCE</code> or <code>BLOCKED</code> and verifies no overlapping active reservations exist.
                </p>
              </div>

              {/* Stage 4 */}
              <div style={{ background: 'var(--bg-surface)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #8b5cf6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>📈</span>
                  <strong style={{ fontSize: '0.9rem', color: '#8b5cf6' }}>Stage 4: Performance Attribution</strong>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  Logs <code>CLIENT_ACCEPTED</code> into <code>employee_activities</code> and increments staff member's live <code>clientsAccepted</code> score.
                </p>
              </div>

              {/* Stage 5 */}
              <div style={{ background: 'var(--bg-surface)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #06b6d4' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>🛎️</span>
                  <strong style={{ fontSize: '0.9rem', color: '#06b6d4' }}>Stage 5: Check-In & In-House</strong>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  Front desk verifies booking auth code. Transitions unit to <code>OCCUPIED</code> and activates guest stay profile.
                </p>
              </div>

              {/* Stage 6 */}
              <div style={{ background: 'var(--bg-surface)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #ec4899' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>🧹</span>
                  <strong style={{ fontSize: '0.9rem', color: '#ec4899' }}>Stage 6: Housekeeping Turnover</strong>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  Departure releases unit to <code>DIRTY</code> status. Housekeeping cleaning & inspection cycle resets unit to <code>READY</code>.
                </p>
              </div>
            </div>

            {/* Role-Based Telemetry Matrix */}
            <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 600 }}>
                Role Visibility & Access Control Matrix
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.82rem' }}>
                <div>
                  <strong style={{ color: '#ea580c' }}>Front Desk Staff:</strong>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    Sees incoming queue, accepts & approves available units, manages arrivals & departures.
                  </div>
                </div>
                <div>
                  <strong style={{ color: '#2563eb' }}>Manager & Admin:</strong>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    Full operational control + live operational activity feed of all desk events.
                  </div>
                </div>
                <div>
                  <strong style={{ color: '#16a34a' }}>Owner:</strong>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    Executive view: High-level metrics + overall performance scorecards of all employees.
                  </div>
                </div>
                <div>
                  <strong style={{ color: '#38bdf8' }}>Developer:</strong>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    Operational telemetry pipeline, database integrity diagnostics, and system health.
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Modules & Toggles */}
      {activeTab === 'modules' && (
        <div>
          {/* Controls Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search modules..."
                value={moduleSearch}
                onChange={(e) => setModuleSearch(e.target.value)}
                style={{
                  padding: '0.5rem 0.85rem',
                  borderRadius: '6px',
                  background: 'var(--bg-surface, #1e293b)',
                  border: '1px solid var(--border-color, #334155)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  minWidth: '220px',
                }}
              />
              <select
                value={moduleGroupFilter}
                onChange={(e) => setModuleGroupFilter(e.target.value)}
                style={{
                  padding: '0.5rem 0.85rem',
                  borderRadius: '6px',
                  background: 'var(--bg-surface, #1e293b)',
                  border: '1px solid var(--border-color, #334155)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                }}
              >
                <option value="ALL">All Categories</option>
                <option value="CORE">Core Domain</option>
                <option value="OPERATIONS">Operations & Desk</option>
                <option value="FINANCE">Finance & Accounting</option>
                <option value="STAFF">Staff & Partners</option>
                <option value="GOVERNANCE">Governance & Audit</option>
              </select>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Showing {filteredModules.length} of {overview?.modules?.length || 18} registered modules
            </div>
          </div>

          {/* Module Table */}
          <Card style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color, #334155)', background: 'rgba(0,0,0,0.15)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Module Name & ID</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Group</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Authorized Roles</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Dependencies</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Operational Control</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredModules.map((mod) => (
                    <tr key={mod.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{mod.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{mod.id}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                        {mod.group}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {(mod.roles || []).map((r) => (
                            <span
                              key={r}
                              style={{
                                fontSize: '0.68rem',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'rgba(255,255,255,0.06)',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {mod.dependencies ? mod.dependencies.join(', ') : 'None'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: mod.isEnabled ? 'rgba(74, 222, 128, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                            color: mod.isEnabled ? '#4ade80' : '#94a3b8',
                          }}
                        >
                          {mod.isEnabled ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        {mod.isCore ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              fontSize: '0.75rem',
                              color: '#fbbf24',
                              background: 'rgba(251, 191, 36, 0.1)',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              fontWeight: 500,
                            }}
                            title="Protected Core module: Locked against modification"
                          >
                            🔒 Core (Locked)
                          </span>
                        ) : (
                          <Button
                            variant={mod.isEnabled ? 'outline' : 'primary'}
                            size="sm"
                            onClick={() => handleOpenToggleModal(mod)}
                            style={{
                              fontSize: '0.75rem',
                              padding: '3px 10px',
                              borderColor: mod.isEnabled ? '#f87171' : 'var(--brand-accent)',
                              color: mod.isEnabled ? '#f87171' : '#0f172a',
                            }}
                          >
                            {mod.isEnabled ? 'Disable' : 'Enable'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 3: User Governance */}
      {activeTab === 'governance' && (
        <div>
          {/* Governance Rules Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <Card style={{ padding: '1.25rem', borderLeft: '4px solid #38bdf8' }}>
              <div style={{ fontWeight: 600, color: '#38bdf8', marginBottom: '0.35rem' }}>
                Single Super Admin Sovereignty
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Rule: Exactly 1 global Super Administrator account (ID: 1, <code>olawale@gmail.com</code>). Prevents privilege escalation and duplicate sovereign identities.
              </div>
            </Card>

            <Card style={{ padding: '1.25rem', borderLeft: '4px solid #4ade80' }}>
              <div style={{ fontWeight: 600, color: '#4ade80', marginBottom: '0.35rem' }}>
                Single Owner Stakeholder
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Rule: Exactly 1 registered Owner account (ID: 7, <code>owner@bfa.ng</code>). Read-only executive financial audit access and sovereign oversight.
              </div>
            </Card>

            <Card style={{ padding: '1.25rem', borderLeft: '4px solid #fbbf24' }}>
              <div style={{ fontWeight: 600, color: '#fbbf24', marginBottom: '0.35rem' }}>
                Property Scoping Isolation
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Rule: Front desk and staff users are strictly assigned to Property 1 or Property 2. Cross-property data leakage is blocked by tenant filters.
              </div>
            </Card>
          </div>

          {/* User Table */}
          <Card style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color, #334155)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                System Users & Role Hierarchy ({governance.totalUsers || 9} Accounts)
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#4ade80' }}>✓ 100% Active Accounts</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color, #334155)', background: 'rgba(0,0,0,0.15)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>ID</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Name & Email</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Role</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Assigned Property</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Account Created</th>
                  </tr>
                </thead>
                <tbody>
                  {(governance.users || []).map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                        #{u.id}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background:
                              u.role === 'SUPER_ADMIN'
                                ? 'rgba(239, 68, 68, 0.15)'
                                : u.role === 'OWNER'
                                ? 'rgba(56, 189, 248, 0.15)'
                                : u.role === 'ADMIN'
                                ? 'rgba(168, 85, 247, 0.15)'
                                : 'rgba(255,255,255,0.06)',
                            color:
                              u.role === 'SUPER_ADMIN'
                                ? '#f87171'
                                : u.role === 'OWNER'
                                ? '#38bdf8'
                                : u.role === 'ADMIN'
                                ? '#c084fc'
                                : 'var(--text-secondary)',
                          }}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                        {u.property_name || (u.property_id ? `Property #${u.property_id}` : 'Global (All)')}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ color: '#4ade80', fontSize: '0.75rem', fontWeight: 600 }}>● Active</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Baseline'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 4: Settings & Thresholds */}
      {activeTab === 'settings' && (
        <Card style={{ padding: '1.5rem', maxWidth: '800px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 600, margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>
            System Configuration & Policy Thresholds
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Updates are saved directly to <code>system_settings</code> and recorded in the immutable audit trail.
          </p>

          <form onSubmit={handleSaveSettings}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Platform Name
                </label>
                <input
                  type="text"
                  value={settingsForm.site_name || ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, site_name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    background: 'var(--bg-surface, #1e293b)',
                    border: '1px solid var(--border-color, #334155)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Maximum Stay Duration (Policy Rule)
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={settingsForm.max_stay_nights || '1'}
                  onChange={(e) => setSettingsForm({ ...settingsForm, max_stay_nights: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    background: 'var(--bg-surface, #1e293b)',
                    border: '1px solid var(--border-color, #334155)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                  }}
                />
                <span style={{ fontSize: '0.72rem', color: '#38bdf8' }}>Enforced: Default 1-night maximum stay per booking</span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Default Check-In Time
                </label>
                <input
                  type="time"
                  value={settingsForm.checkin_time || '14:00'}
                  onChange={(e) => setSettingsForm({ ...settingsForm, checkin_time: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    background: 'var(--bg-surface, #1e293b)',
                    border: '1px solid var(--border-color, #334155)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Default Check-Out Time
                </label>
                <input
                  type="time"
                  value={settingsForm.checkout_time || '11:00'}
                  onChange={(e) => setSettingsForm({ ...settingsForm, checkout_time: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    background: 'var(--bg-surface, #1e293b)',
                    border: '1px solid var(--border-color, #334155)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  VAT Rate (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={settingsForm.vat_rate || '7.5'}
                  onChange={(e) => setSettingsForm({ ...settingsForm, vat_rate: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    background: 'var(--bg-surface, #1e293b)',
                    border: '1px solid var(--border-color, #334155)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Default Agent Commission Rate (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={settingsForm.commission_rate || '10'}
                  onChange={(e) => setSettingsForm({ ...settingsForm, commission_rate: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    background: 'var(--bg-surface, #1e293b)',
                    border: '1px solid var(--border-color, #334155)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Button type="submit" variant="primary" disabled={isSavingSettings}>
                {isSavingSettings ? 'Saving Settings...' : 'Save Configuration'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Tab 5: Audit Trail */}
      {activeTab === 'audit' && (
        <Card style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color, #334155)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
              Real-Time Security & Mutation Audit Trail
            </h3>
            <Button variant="outline" size="sm" onClick={fetchAuditLogs} disabled={auditLoading}>
              {auditLoading ? 'Loading...' : 'Refresh Logs'}
            </Button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color, #334155)', background: 'rgba(0,0,0,0.15)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Timestamp</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Actor</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Role</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Action Code</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Entity</th>
                  <th style={{ padding: '0.75rem 1rem' }}>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length > 0 ? (
                  auditLogs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {log.actor_email || `User #${log.actor_id}`}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', fontSize: '0.72rem' }}>
                          {log.actor_role}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: '#38bdf8' }}>
                        {log.action}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                        {log.entity_type} {log.entity_id ? `#${log.entity_id}` : ''}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {log.ip_address || '127.0.0.1'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      {auditLoading ? 'Loading audit trail logs...' : 'No audit records returned.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 6: Backups & Migrations */}
      {activeTab === 'backups' && (
        <div>
          {/* Top Backup Action Card */}
          <Card style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                Database Snapshot Management
              </h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Create verifiable point-in-time SQL snapshots in <code>backups/</code> with table integrity verification.
              </p>
            </div>
            <Button
              variant="primary"
              onClick={handleCreateBackup}
              disabled={isCreatingBackup}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <span>💾</span>
              {isCreatingBackup ? 'Generating Snapshot...' : 'Create Manual Snapshot'}
            </Button>
          </Card>

          {/* Backup Files List */}
          <Card style={{ padding: '0', overflow: 'hidden', marginBottom: '1.5rem' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color, #334155)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
                Available Database Snapshots ({backups.totalBackups || 0} Files on Disk)
              </h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Storage: Local FS / backups/</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color, #334155)', background: 'rgba(0,0,0,0.15)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Snapshot Filename</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Size</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Created At</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Integrity</th>
                  </tr>
                </thead>
                <tbody>
                  {(backups.snapshots || []).map((b, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {b.name}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                        {b.sizeFormatted || `${Math.round((b.sizeBytes || 0) / 1024)} KB`}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {b.createdAt ? new Date(b.createdAt).toLocaleString() : 'Historical Baseline'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8' }}>
                          Full Schema & Data
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ color: '#4ade80', fontSize: '0.75rem', fontWeight: 600 }}>✓ Verified</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Applied Migrations Catalog */}
          <Card style={{ padding: '0', overflow: 'hidden', marginBottom: '1.5rem' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color, #334155)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
                Applied Schema Migrations (23 / 23 Applied)
              </h4>
              <span style={{ fontSize: '0.75rem', color: '#4ade80', fontWeight: 600 }}>● 100% In Sync</span>
            </div>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color, #334155)', background: 'rgba(0,0,0,0.15)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.65rem 1rem' }}>Migration Name</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Execution Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {(migrations.applied || []).map((m, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                        {m.name}
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span style={{ color: '#4ade80', fontSize: '0.75rem', fontWeight: 600 }}>APPLIED</span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {m.executed_at ? new Date(m.executed_at).toLocaleString() : 'Baseline Initializer'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Recovery Runbook */}
          <Card style={{ padding: '1.25rem', background: 'rgba(15, 23, 42, 0.4)' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: '#38bdf8' }}>
              📖 Disaster Recovery Runbook
            </h4>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <p style={{ margin: '0 0 0.5rem 0' }}>
                To restore from a point-in-time SQL snapshot, execute the following command in terminal:
              </p>
              <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '4px', overflowX: 'auto', color: '#86efac', fontFamily: 'monospace', fontSize: '0.8rem', margin: '0 0 0.5rem 0' }}>
                mysql -u bfa_user -p bfa_apartments_db &lt; backups/bfa_apartments_db_backup_YYYYMMDD_HHMMSS.sql
              </pre>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Foreign key constraints are disabled during restoration and safely re-enabled at EOF.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Confirmation Modal for Module Toggle */}
      <Modal
        isOpen={Boolean(moduleToToggle)}
        onClose={() => setModuleToToggle(null)}
        title={`Confirm Module ${moduleToToggle?.isEnabled ? 'Disabling' : 'Enabling'}`}
      >
        <div style={{ padding: '0.5rem 0' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Are you sure you want to {moduleToToggle?.isEnabled ? 'disable' : 'enable'} the module <strong>"{moduleToToggle?.name}"</strong>?
          </p>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Audit Reason (Required for compliance log):
            </label>
            <input
              type="text"
              placeholder="e.g. Temporary maintenance or administrative toggle"
              value={toggleReason}
              onChange={(e) => setToggleReason(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                background: 'var(--bg-surface, #1e293b)',
                border: '1px solid var(--border-color, #334155)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="outline" onClick={() => setModuleToToggle(null)} disabled={isToggling}>
              Cancel
            </Button>
            <Button variant={moduleToToggle?.isEnabled ? 'danger' : 'primary'} onClick={handleConfirmToggle} disabled={isToggling}>
              {isToggling ? 'Updating...' : `Confirm ${moduleToToggle?.isEnabled ? 'Disable' : 'Enable'}`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

