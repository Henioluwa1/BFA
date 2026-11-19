import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { systemService, auditService, automationService, accessService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function OperationsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const role = String(user?.role || '').toUpperCase();
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isAdmin = role === 'ADMIN';
  const isOwner = role === 'OWNER';
  const allowedTabs = isSuperAdmin
    ? ['health', 'flow', 'modules', 'governance', 'settings', 'backups', 'development']
    : [];

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
  const [selectedModule, setSelectedModule] = useState(null);
  const [selectedGovernanceUser, setSelectedGovernanceUser] = useState(null);

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
  const [governanceChanges, setGovernanceChanges] = useState([]);
  const [governanceChangesLoading, setGovernanceChangesLoading] = useState(false);
  const [governanceChangesError, setGovernanceChangesError] = useState('');
  const [migrationCatalog, setMigrationCatalog] = useState(null);
  const [migrationError, setMigrationError] = useState('');
  const [devStatus, setDevStatus] = useState(null);
  const [devError, setDevError] = useState('');
  const [devLoading, setDevLoading] = useState(false);
  const [devForm, setDevForm] = useState({ taskTitle: '', taskDescription: '', category: 'OPERATIONS', priority: 'MEDIUM', expectedOutcome: '', implementationContext: '' });
  const [devValidationError, setDevValidationError] = useState('');
  const [taskPlan, setTaskPlan] = useState(null);
  const [accessGovernance, setAccessGovernance] = useState({ capabilities: [], overrides: [], approvals: [] });
  const [accessGovError, setAccessGovError] = useState('');
  const [accessGovLoading, setAccessGovLoading] = useState(false);
  const [accessGovLoaded, setAccessGovLoaded] = useState(false);

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

  // Reuse the global audit service to show real governance changes in this tab.
  const fetchGovernanceChanges = useCallback(async () => {
    setGovernanceChangesLoading(true);
    setGovernanceChangesError('');
    try {
      const res = await auditService.getLogs({ action: 'GOVERNANCE_ACTIONS', limit: 20 });
      const data = res.data?.logs || res.logs || res.data || [];
      const records = Array.isArray(data) ? data : [];
      setGovernanceChanges(records);
    } catch (err) {
      setGovernanceChangesError(err.message || 'Governance change history could not be loaded.');
    } finally {
      setGovernanceChangesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowedTabs.length) fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (activeTab === 'governance' && !isOwner) fetchGovernanceChanges();
  }, [activeTab, isOwner, fetchGovernanceChanges]);

  useEffect(() => {
    if (activeTab !== 'governance' || isOwner || accessGovLoading || accessGovLoaded) return;
    setAccessGovLoading(true);
    setAccessGovError('');
    const requests = [accessService.getCapabilities(), accessService.getOverrides()];
    if (isSuperAdmin) requests.push(accessService.getApprovalRequests({ status: 'PENDING' }));
    Promise.all(requests).then(([caps, overrides, approvals]) => setAccessGovernance({
      capabilities: caps.data || caps || [],
      overrides: overrides.data || overrides || [],
      approvals: approvals?.data || approvals || [],
    })).catch((err) => setAccessGovError(err.message || 'Access governance data could not be loaded.')).finally(() => { setAccessGovLoading(false); setAccessGovLoaded(true); });
  }, [activeTab, isOwner, isSuperAdmin, accessGovLoading, accessGovLoaded]);

  useEffect(() => {
    if (activeTab !== 'backups' || migrationCatalog) return;
    systemService.getMigrationCatalog().then((res) => setMigrationCatalog(res.data || res)).catch((err) => setMigrationError(err.message || 'Migration catalog unavailable.'));
  }, [activeTab, migrationCatalog]);

  const runDevAction = async (actionId, parameters = {}) => {
    setDevLoading(true);
    setDevError('');
    try {
      const res = await automationService.execute({ actionId, parameters });
      return res.data?.result || res.result;
    } catch (err) {
      setDevError(err.message || 'Development action failed.');
      return null;
    } finally { setDevLoading(false); }
  };

  const loadDevelopmentCenter = async () => {
    if (!isSuperAdmin) return;
    const status = await runDevAction('dev.get_system_status');
    if (status) setDevStatus(status);
  };

  const handlePlanTask = async (event) => {
    event.preventDefault();
    setDevValidationError('');
    if (devForm.taskTitle.trim().length < 3) { setDevValidationError('Enter a task title with at least 3 characters.'); return; }
    if (devForm.taskDescription.trim().length < 20) { setDevValidationError('Provide at least 20 characters describing the task and its current behavior.'); return; }
    if (devForm.expectedOutcome.trim().length < 5) { setDevValidationError('Describe the expected outcome in at least 5 characters.'); return; }
    setTaskPlan(null);
    const result = await runDevAction('dev.plan_task', { ...devForm, taskTitle: devForm.taskTitle.trim(), taskDescription: devForm.taskDescription.trim(), expectedOutcome: devForm.expectedOutcome.trim(), implementationContext: devForm.implementationContext.trim() });
    if (result) setTaskPlan(result);
  };

  useEffect(() => {
    if (allowedTabs.length && !allowedTabs.includes(activeTab)) setActiveTab(allowedTabs[0]);
  }, [allowedTabs, activeTab]);

  useEffect(() => {
    if (activeTab === 'development' && isSuperAdmin && !devStatus && !devLoading) loadDevelopmentCenter();
  }, [activeTab, isSuperAdmin, devStatus, devLoading]);

  // Handle Module Toggle
  const handleOpenToggleModal = (mod) => {
    if (mod.isProtectedCore) {
      addToast(`Core module "${mod.name}" is locked and cannot be disabled.`, 'warning');
      return;
    }
    setModuleToToggle(mod);
    setToggleReason('');
  };

  const handleConfirmToggle = async () => {
    if (!moduleToToggle) return;
    if (!isSuperAdmin) { addToast('Only Super Admin can change module availability.', 'error'); return; }
    setIsToggling(true);
    try {
      const newEnabled = !moduleToToggle.isEnabled;
      await systemService.toggleModule(moduleToToggle.id, {
        isEnabled: newEnabled,
        reason: toggleReason.trim(),
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
    if (!isSuperAdmin) { addToast('Only Super Admin can create backups.', 'error'); return; }
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
    if (!isAdmin && !isSuperAdmin) { addToast('Only Administrators can update system settings.', 'error'); return; }
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
      const matchGroup = moduleGroupFilter === 'ALL' || m.category === moduleGroupFilter;
      return matchSearch && matchGroup;
    });
  }, [overview?.modules, moduleSearch, moduleGroupFilter]);

  // Subsystems from diagnostics
  const subsystems = overview?.diagnostics?.subsystems || [];
  const diagnostics = overview?.diagnostics || {};
  const governance = overview?.governance || {};
  const backups = overview?.backups || {};
  const migrations = overview?.migrations || {};
  const backupSnapshots = backups.snapshots || backups.history || [];
  const systemsOperational = diagnostics.status === 'ALL_SYSTEMS_OPERATIONAL' || diagnostics.status === 'HEALTHY';
  const healthColor = systemsOperational ? '#4ade80' : diagnostics.status === 'UNKNOWN' ? '#fbbf24' : '#f87171';
  const subsystemHealthy = (status) => ['OPERATIONAL', 'HEALTHY'].includes(status);
  const governanceRoleRows = governance.roles?.length
    ? governance.roles.map((roleInfo) => ({
      ...roleInfo,
      total: governance.roleDistribution?.find((item) => item.role === roleInfo.role)?.total ?? 0,
    }))
    : (governance.roleDistribution || []).map((item) => ({ ...item, name: item.role, capabilities: null, desc: null }));

  if (!overview && isLoading) return <div className="page-container" role="status" style={{ padding: '2rem' }}>Loading Operations Control Center telemetry…</div>;
  if (!overview && error) return <div className="page-container" style={{ padding: '2rem', maxWidth: 900 }}><h1>Operations Control Center</h1><section role="alert" style={{ padding: '1.25rem', border: '1px solid #ef4444', borderRadius: 8 }}><strong>Telemetry unavailable</strong><p>{error}</p><p>The system state is unknown because the overview request failed. This does not mean the services themselves are degraded.</p><Button onClick={() => fetchOverview()}>Retry telemetry</Button></section></div>;

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
                background: systemsOperational ? 'rgba(74, 222, 128, 0.15)' : diagnostics.status === 'UNKNOWN' ? 'rgba(251,191,36,0.12)' : 'rgba(239, 68, 68, 0.15)',
                color: healthColor,
                border: `1px solid ${healthColor}55`,
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor' }} />
              {systemsOperational ? 'All Systems Operational' : diagnostics.status === 'UNKNOWN' ? 'Health Partially Known' : 'System Degraded'}
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
              Env: {diagnostics.environment || 'Unknown'}
            </span>
          </div>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            System Telemetry, Subsystem Diagnostics, Feature Governance & Continuous Development
          </p>
            <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Last telemetry check: {diagnostics.timestamp ? new Date(diagnostics.timestamp).toLocaleString() : 'Unknown'}
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
          { key: 'modules', label: `Modules & Toggles (${overview?.modules?.length ?? 0})`, icon: '🎛️' },
          { key: 'governance', label: `User Governance (${governance.totalUsers ?? 0})`, icon: '👥' },
          { key: 'settings', label: 'Settings & Thresholds', icon: '⚙️' },
          { key: 'backups', label: `Backups & Migrations (${backups.totalBackups || 0})`, icon: '💾' },
          { key: 'development', label: 'Continuous Development', icon: '🧭' },
        ].filter((tab) => allowedTabs.includes(tab.key)).map((tab) => (
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
                {diagnostics.database?.appliedMigrationsCount ?? '—'} / {diagnostics.database?.totalMigrationFilesCount ?? '—'} Schema Migrations
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
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Healthy Subsystem Probes</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4ade80', marginBottom: '0.25rem' }}>
                {subsystems.filter((s) => subsystemHealthy(s.status)).length} / {subsystems.length}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {subsystems.filter((s) => subsystemHealthy(s.status)).map((s) => s.name).join(', ') || 'None'} · {subsystems.filter((s) => !subsystemHealthy(s.status)).length} unknown or degraded
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
                            background: subsystemHealthy(sub.status) ? 'rgba(74, 222, 128, 0.15)' : sub.status === 'UNKNOWN' ? 'rgba(251,191,36,0.12)' : 'rgba(239, 68, 68, 0.15)',
                            color: subsystemHealthy(sub.status) ? '#4ade80' : sub.status === 'UNKNOWN' ? '#fbbf24' : '#f87171',
                          }}
                        >
                          ● {sub.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {sub.detail || sub.endpoint || 'Internal Loopback'}
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {diagnostics.timestamp ? new Date(diagnostics.timestamp).toLocaleTimeString() : 'Not checked'}
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
                    <div style={{ color: 'var(--text-secondary)' }}>{w.actor_email} · {w.entity_type}{w.entity_id ? ` #${w.entity_id}` : ''}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{w.created_at ? new Date(w.created_at).toLocaleString() : 'Timestamp unavailable'}</div>
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
                  Interactive view of registered module dependencies, activation settings, and live subsystem probe results.
                </p>
              </div>
              <Badge status={diagnostics.status === 'DEGRADED' ? 'danger' : diagnostics.status === 'UNKNOWN' ? 'warning' : 'available'}>{diagnostics.status || 'UNKNOWN'}</Badge>
            </div>

            {/* BFA's documented hierarchy and live module relationships. The dependency edges are sourced from the backend registry. */}
            <div style={{ padding: '1rem', borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
              <h3 style={{ margin: '0 0 .5rem' }}>BFA business hierarchy</h3>
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Company <span aria-label="contains">→</span> Properties <span aria-label="contain">→</span> Apartments / Units <span aria-label="booked by">→</span> Reservations <span aria-label="associated with">→</span> Tenants / Guests</p>
              <small style={{ color: 'var(--text-muted)' }}>Hierarchy from the system architecture specification. Operational modules below show their registered dependency edges.</small>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.75rem', fontSize: '.78rem', color: 'var(--text-secondary)' }}>
              <span>Legend:</span><span>● Green = probe healthy</span><span>● Amber = unknown / unprobed</span><span>● Red = degraded / unavailable</span><span>· Enabled means configured, not health checked</span>
            </div>
            <h3>Registered dependency flow</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Arrows show dependency direction (dependency → module). Select a module for its purpose, route, roles and current probe coverage.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '0.8rem' }}>
              {(overview?.modules || []).map((mod) => <button key={mod.id} type="button" onClick={() => setSelectedModule(mod)} style={{ textAlign: 'left', padding: '1rem', borderRadius: 8, border: selectedModule?.id === mod.id ? '2px solid var(--brand-accent)' : '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer' }}><strong>{(mod.dependencies || []).length ? (mod.dependencies || []).map((dep) => `${dep} →`).join('  ') : 'No registered upstream dependency'} {mod.id}</strong><div style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.75rem', marginTop: '.3rem' }}>{mod.route || mod.id}</div><div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>{mod.name} · {mod.category} · {mod.isEnabled ? 'Configured enabled' : 'Disabled'}{mod.isProtectedCore ? ' · Protected core' : ''}</div><div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.35rem' }}>{mod.description}</div></button>)}
              {!overview?.modules?.length && <p>{isSuperAdmin ? 'Module relationship data is unavailable because the operations overview did not return the module registry.' : 'Detailed module registry and dependency governance are restricted to Super Admin. This view continues to show the documented business hierarchy and live subsystem diagnostics.'}</p>}
            </div>
            {selectedModule && <Card style={{ marginTop: '1rem', padding: '1rem' }}><button type="button" onClick={() => setSelectedModule(null)} aria-label="Close module details" style={{ float: 'right' }}>Close</button><h3>{selectedModule.name}</h3><p>{selectedModule.description}</p><p><strong>Route:</strong> {selectedModule.route || 'Not registered'}</p><p><strong>Activation:</strong> {selectedModule.isEnabled ? 'Enabled' : 'Disabled'} · <strong>Live status:</strong> {selectedModule.isEnabled ? 'UNKNOWN — module-specific health probe is not registered' : 'Disabled'}</p><p><strong>Dependencies:</strong> {(selectedModule.dependencies || []).join(', ') || 'None registered'}</p><p><strong>Authorized roles:</strong> {(selectedModule.roles || []).join(', ')}</p><p><strong>Governance:</strong> {selectedModule.isProtectedCore ? 'Protected core module' : 'Toggle permitted to authorized administrators'}</p><p><strong>Last successful module check:</strong> Not available; no module-specific probe exists.</p></Card>}
            <div style={{ marginTop: '1.25rem' }}><h3>Live subsystem probes</h3>{subsystems.length ? subsystems.map((system) => <div key={system.name} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border-color)' }}><strong>{system.name}</strong> · {system.status}<div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{system.detail}</div><small style={{ color: 'var(--text-muted)' }}>Last checked: {diagnostics.timestamp ? new Date(diagnostics.timestamp).toLocaleString() : 'Not checked'}</small></div>) : <p>Subsystem health is unavailable.</p>}</div>
              {/* OCC role boundary */}
            <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 600 }}>
                Operations Center Access
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.82rem' }}>
                <p><strong>SUPER_ADMIN / ADMIN</strong><br/>Administrative diagnostics and authorized system governance controls.</p>
                <p><strong>OWNER</strong><br/>Read-only health, system flow, and aggregate governance counts. User records, capabilities, approvals, module controls, backups, migrations, and development tools are restricted.</p>
                <p><strong>OPERATIONS_MANAGER / RECEPTIONIST / STAFF / AGENT</strong><br/>This system governance center is not available to these roles.</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Modules & Toggles */}
      {activeTab === 'modules' && isSuperAdmin && (
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
                <option value="Core">Core</option>
                <option value="Front Office">Front Office</option>
                <option value="Finance">Finance</option>
                <option value="Staff & HR">Staff & HR</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Governance">Governance</option>
              </select>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Showing {filteredModules.length} of {overview?.modules?.length ?? 0} registered modules
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
                        {mod.category}
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
                        {mod.isProtectedCore ? (
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
          <Card style={{ padding: '1.25rem', marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '.75rem', marginBottom: '1rem' }}>
              {[['Registered users', governance.totalUsers], ['Active', governance.activeUsers], ['Inactive', governance.inactiveUsers]].map(([label, value]) => <div key={label} style={{ padding: '.85rem', borderRadius: 8, background: 'var(--bg-surface)' }}><div style={{ color: 'var(--text-secondary)', fontSize: '.8rem' }}>{label}</div><strong style={{ fontSize: '1.35rem' }}>{value ?? '—'}</strong></div>)}
            </div>
            <h3 style={{ margin: '0 0 .75rem' }}>Role distribution</h3>
            <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th align="left">Role</th><th align="left">Accounts</th><th align="left">Permission summary</th><th align="left">OCC access</th></tr></thead><tbody>
              {governanceRoleRows.map((roleInfo) => {
                const occAccess = roleInfo.role === 'SUPER_ADMIN' ? 'Full authorized access' : roleInfo.role === 'ADMIN' ? 'Administrative access' : roleInfo.role === 'OWNER' ? 'Read-only summary' : 'Denied';
                const permissions = roleInfo.capabilities ? `${roleInfo.capabilities.length} capabilities · ${roleInfo.desc}` : 'Permission details are restricted in the Owner view.';
                return <tr key={roleInfo.role} style={{ borderTop: '1px solid var(--border-color)' }}><td style={{ padding: '.65rem' }}><strong>{roleInfo.role}</strong></td><td style={{ padding: '.65rem' }}>{roleInfo.total}</td><td style={{ padding: '.65rem', color: 'var(--text-secondary)' }}>{permissions}</td><td style={{ padding: '.65rem' }}>{occAccess}</td></tr>;
              })}
              {!governanceRoleRows.length && <tr><td colSpan="4" role="status">Role distribution is unavailable.</td></tr>}
            </tbody></table></div>
          </Card>
          {!isOwner && <Card style={{ padding: '1.25rem', marginBottom: '1rem' }}><h3>Role permissions</h3>{(governance.roles || []).map((roleInfo) => <details key={roleInfo.role} style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--border-color)' }}><summary><strong>{roleInfo.name}</strong> · {roleInfo.role}</summary><p>{roleInfo.desc}</p><p><strong>Capabilities:</strong> {(roleInfo.capabilities || []).join(', ') || 'No capability list returned'}</p></details>)}</Card>}
          {!isOwner && <Card style={{ padding: '1.25rem', marginBottom: '1rem' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}><h3 style={{ margin: 0 }}>Access governance</h3><a href="/app/access-control">Open Access Control Policies</a></div>{accessGovLoading && <p>Loading capabilities and access requests…</p>}{accessGovError && <p role="alert" style={{ color: '#f87171' }}>{accessGovError}</p>}{!accessGovLoading && !accessGovError && <><h4>Capabilities ({accessGovernance.capabilities.length})</h4>{accessGovernance.capabilities.length ? accessGovernance.capabilities.map((cap) => <span key={cap.name || cap.id} style={{ display: 'inline-block', margin: '0.2rem', padding: '0.3rem 0.55rem', borderRadius: 12, background: cap.is_enabled ? 'rgba(74,222,128,.12)' : 'rgba(251,191,36,.12)' }}>{cap.name} · {cap.is_enabled ? 'Enabled' : 'Disabled'}</span>) : <p>No capabilities returned.</p>}<h4>Access overrides ({accessGovernance.overrides.length})</h4>{accessGovernance.overrides.length ? accessGovernance.overrides.map((row) => <p key={row.id}>Override #{row.id} · {row.capability_name} · {row.override_type} · {row.is_active ? 'Active' : 'Inactive'}</p>) : <p>No access overrides recorded.</p>}{isSuperAdmin && <><h4>Pending access requests ({accessGovernance.approvals.length})</h4>{accessGovernance.approvals.length ? accessGovernance.approvals.map((row) => <p key={row.id}>Request #{row.id} · {row.capability_name || row.capabilityName} · {row.status}</p>) : <p>No pending approval requests.</p>}</>}</>}</Card>}

          {!isOwner && <Card style={{ padding: '1.25rem', marginBottom: '1rem' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}><h3 style={{ margin: 0 }}>Recent governance changes</h3><Button type="button" variant="outline" size="sm" onClick={fetchGovernanceChanges} disabled={governanceChangesLoading}>{governanceChangesLoading ? 'Refreshing…' : 'Refresh changes'}</Button></div>{governanceChangesLoading && <p role="status">Loading governance history…</p>}{governanceChangesError && <p role="alert" style={{ color: '#f87171' }}>{governanceChangesError}</p>}{!governanceChangesLoading && !governanceChangesError && (governanceChanges.length ? governanceChanges.slice(0, 10).map((change) => <p key={change.id}><strong>{change.action}</strong> · {change.actor_email || `User #${change.actor_id}`} · {change.created_at ? new Date(change.created_at).toLocaleString() : 'Time unavailable'}</p>) : <p>No matching governance changes were returned from the audit service.</p>)}</Card>}

          {/* User Table */}
          <Card style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color, #334155)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                System Users & Role Hierarchy ({governance.totalUsers ?? 0} Accounts)
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{governance.activeUsers ?? 0} active · {governance.inactiveUsers ?? 0} inactive</span>
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
                    {!isOwner && <th style={{ padding: '0.75rem 1rem' }}>Access details</th>}
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
                        <span style={{ color: u.status === 'ACTIVE' ? '#4ade80' : '#f87171', fontSize: '0.75rem', fontWeight: 600 }}>● {u.status || 'Unknown'}</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Baseline'}
                      </td>
                      {!isOwner && <td style={{ padding: '0.75rem 1rem' }}><Button type="button" variant="outline" size="sm" onClick={() => setSelectedGovernanceUser(u)}>View details</Button></td>}
                    </tr>
                  ))}
                  {!(governance.users || []).length && <tr><td colSpan={isOwner ? 6 : 7} style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{isOwner ? 'Individual user records are restricted for the Owner view.' : 'No user records were returned.'}</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 4: Settings & Thresholds */}
      {activeTab === 'settings' && (isAdmin || isSuperAdmin) && (
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

      {/* Tab 6: Backups & Migrations */}
      {activeTab === 'backups' && isSuperAdmin && (
        <div>
          {/* Top Backup Action Card */}
          <Card style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                Local SQL Backup Artifacts
              </h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {backups.engine} · Files found in the local backups directory. The file inventory does not verify backup contents or restore integrity.
              </p>
            </div>
            {backups.engine === 'MySQL' && (isAdmin || isSuperAdmin) && <Button
              variant="primary"
              onClick={handleCreateBackup}
              disabled={isCreatingBackup}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <span>💾</span>
              {isCreatingBackup ? 'Generating Snapshot...' : 'Create Manual Snapshot'}
            </Button>}
            {backups.engine === 'PostgreSQL' && <p role="status" style={{ color: '#fbbf24', margin: 0 }}>Snapshot generation is unavailable because this deployment has no PostgreSQL backup provider configured.</p>}
          </Card>

          {/* Backup Files List */}
          <Card style={{ padding: '0', overflow: 'hidden', marginBottom: '1.5rem' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color, #334155)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
                Local SQL Files ({backups.totalBackups ?? 0})
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
                    <th style={{ padding: '0.75rem 1rem' }}>Artifact</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Availability</th>
                  </tr>
                </thead>
                <tbody>
                  {backupSnapshots.map((b, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {b.name || b.filename}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                        {b.sizeFormatted || `${Math.round((b.sizeBytes || 0) / 1024)} KB`}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {b.createdAt ? new Date(b.createdAt).toLocaleString() : 'Historical Baseline'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8' }}>
                          SQL file
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>Present on disk · engine unverified</span>
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
                Migration Catalog {migrationCatalog ? `(${migrationCatalog.appliedMigrations}/${migrationCatalog.totalMigrations} applied)` : ''}
              </h4>
              <span style={{ fontSize: '0.75rem', color: migrationCatalog?.status === 'IN_SYNC' ? '#4ade80' : '#fbbf24', fontWeight: 600 }}>{migrationCatalog?.status || (migrationError ? 'UNAVAILABLE' : 'Loading')}</span>
            </div>
            {migrationError && <p style={{ padding: '0.8rem 1rem', color: '#f87171' }}>{migrationError}</p>}
            {migrationCatalog && <p style={{ padding: '0.5rem 1rem', margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem' }}>{migrationCatalog.engine} · {migrationCatalog.migrationSystem} · {migrationCatalog.pendingMigrations} pending · Checked {new Date(migrationCatalog.checkedAt).toLocaleString()}</p>}
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
                  {(migrationCatalog?.migrations || []).map((m, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                        {m.name}
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span style={{ color: m.status === 'APPLIED' ? '#4ade80' : '#fbbf24', fontSize: '0.75rem', fontWeight: 600 }}>{m.status}</span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {m.executedAt ? new Date(m.executedAt).toLocaleString() : '—'}
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
                Recovery must use the database client and engine matching the configured environment. Confirm the target and backup before restoring.
              </p>
              <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '4px', overflowX: 'auto', color: '#86efac', fontFamily: 'monospace', fontSize: '0.8rem', margin: '0 0 0.5rem 0' }}>
                Select a snapshot from the inventory and follow the deployment recovery procedure for the active database engine.
              </pre>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                The Operations Center does not execute restores or modify database state.
              </p>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'development' && (isSuperAdmin || isAdmin) && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {devError && <p role="alert" style={{ color: '#f87171', margin: 0 }}>{devError}</p>}
          {isSuperAdmin && <Card style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div><h3 style={{ margin: 0 }}>System Development Status</h3><p style={{ color: 'var(--text-secondary)', marginBottom: 0 }}>Super Admin diagnostic summary from the existing development status operation.</p></div>
              <Button variant="outline" onClick={loadDevelopmentCenter} disabled={devLoading}>{devLoading ? 'Refreshing…' : 'Refresh status'}</Button>
            </div>
            {devLoading && !devStatus && <p role="status">Loading system development status…</p>}
            {!devLoading && !devError && !devStatus && <p>No development status response is available.</p>}
            {devStatus && <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '.75rem', marginBottom: 0 }}>
              <div><dt>Status</dt><dd>{devStatus.status || 'UNKNOWN'}</dd></div>
              <div><dt>Uptime</dt><dd>{devStatus.uptime || 'Unavailable'}</dd></div>
              <div><dt>Database latency</dt><dd>{devStatus.database?.latencyMs ?? 'Unknown'} ms</dd></div>
              <div><dt>Migrations</dt><dd>{devStatus.database?.inSync == null ? 'Restricted / unavailable' : `${devStatus.database.appliedMigrations} applied · ${devStatus.database.inSync ? 'in sync' : 'out of sync'}`}</dd></div>
              <div><dt>Runtime</dt><dd>{devStatus.runtime?.nodeVersion || 'Unknown'} · {devStatus.runtime?.platform || 'Unknown'}</dd></div>
              <div><dt>Users / modules</dt><dd>{devStatus.totalUsers ?? '—'} / {devStatus.totalModules ?? '—'}</dd></div>
            </dl>}
          </Card>}
          <Card style={{ padding: '1.25rem' }}>
            <div style={{ marginBottom: '1rem' }}><h3 style={{ margin: 0 }}>Plan a Development Task</h3><p style={{ color: 'var(--text-secondary)', margin: '.35rem 0 0' }}>Build a structured implementation plan with the existing BFA development planning operation. Submitted text is treated as task context, not executable instructions.</p></div>
            {devValidationError && <p role="alert" style={{ color: '#f87171' }}>{devValidationError}</p>}
            <form onSubmit={handlePlanTask} style={{ display: 'grid', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '1rem' }}>
                <label style={{ display: 'grid', gap: '.4rem' }}>Task title<input required minLength={3} maxLength={180} value={devForm.taskTitle} onChange={(e) => setDevForm({ ...devForm, taskTitle: e.target.value })} placeholder="Short name for the proposed work" /></label>
                <label style={{ display: 'grid', gap: '.4rem' }}>Task category<select value={devForm.category} onChange={(e) => setDevForm({ ...devForm, category: e.target.value })}><option value="OPERATIONS">Operations</option><option value="ACCOUNTING">Accounting</option><option value="SECURITY">Security</option><option value="REPORTS">Reports</option><option value="INFRASTRUCTURE">Infrastructure</option><option value="GOVERNANCE">Governance</option></select></label>
                <label style={{ display: 'grid', gap: '.4rem' }}>Priority<select value={devForm.priority} onChange={(e) => setDevForm({ ...devForm, priority: e.target.value })}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label>
              </div>
              <label style={{ display: 'grid', gap: '.4rem' }}>Detailed task description<textarea required minLength={20} maxLength={12000} rows={5} value={devForm.taskDescription} onChange={(e) => setDevForm({ ...devForm, taskDescription: e.target.value })} placeholder="Describe the current behavior, requested change, and relevant workflow." /></label>
              <label style={{ display: 'grid', gap: '.4rem' }}>Expected outcome<textarea required minLength={5} maxLength={3000} rows={2} value={devForm.expectedOutcome} onChange={(e) => setDevForm({ ...devForm, expectedOutcome: e.target.value })} placeholder="How will a successful result be observed?" /></label>
              <label style={{ display: 'grid', gap: '.4rem' }}>Implementation context and constraints<textarea maxLength={6000} rows={3} value={devForm.implementationContext} onChange={(e) => setDevForm({ ...devForm, implementationContext: e.target.value })} placeholder="Relevant modules, compatibility needs, permissions, or constraints." /></label>
              <div><Button type="submit" disabled={devLoading}>{devLoading ? 'Preparing plan…' : 'Generate implementation plan'}</Button>{devLoading && <span role="status" style={{ marginLeft: '.75rem', color: 'var(--text-secondary)' }}>The existing planning operation is working…</span>}</div>
            </form>
            {taskPlan && <section aria-live="polite" style={{ marginTop: '1.25rem', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
              <h4 style={{ marginTop: 0 }}>Planning response · {taskPlan.framework}</h4>
              <p><strong>{taskPlan.task?.title}</strong> · {taskPlan.task?.category} · {taskPlan.task?.priority}</p>
              <p><strong>Expected outcome:</strong> {taskPlan.task?.expectedOutcome}</p>
              {taskPlan.task?.implementationContext && <p><strong>Context:</strong> {taskPlan.task.implementationContext}</p>}
              {taskPlan.steps?.length ? <ol>{taskPlan.steps.map((step) => <li key={step.step}><strong>{step.phase}:</strong> {step.description}</li>)}</ol> : <p>The planning operation returned no implementation steps.</p>}
              {taskPlan.inputHandling && <small>{taskPlan.inputHandling}</small>}
            </section>}
          </Card>
        </div>
      )}

      <Modal isOpen={Boolean(selectedGovernanceUser)} onClose={() => setSelectedGovernanceUser(null)} title="User access details">
        {selectedGovernanceUser && <div style={{ display: 'grid', gap: '.75rem' }}>
          <p><strong>{selectedGovernanceUser.name}</strong><br /><span style={{ color: 'var(--text-secondary)' }}>{selectedGovernanceUser.email}</span></p>
          <p><strong>Account:</strong> #{selectedGovernanceUser.id} · {selectedGovernanceUser.status || 'Status unavailable'} · {selectedGovernanceUser.last_login_at ? `Last login ${new Date(selectedGovernanceUser.last_login_at).toLocaleString()}` : 'No recorded last login'}</p>
          <p><strong>Role:</strong> {selectedGovernanceUser.role}<br /><span>{(governance.roles || []).find((roleInfo) => roleInfo.role === selectedGovernanceUser.role)?.desc || 'No role description is registered.'}</span></p>
          <p><strong>Property scope:</strong> {selectedGovernanceUser.property_name || (selectedGovernanceUser.property_id ? `Property #${selectedGovernanceUser.property_id}` : 'Global scope')}</p>
          <p><strong>Role capabilities:</strong> {Array.isArray(selectedGovernanceUser.permissions) ? selectedGovernanceUser.permissions.join(', ') || 'No capabilities assigned' : 'Permission summary unavailable'}</p>
          <p><strong>Management:</strong> User identity and role are managed in the existing Team interface. <a href="/app/team">Open Team & RBAC</a></p>
        </div>}
      </Modal>

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
              Audit Reason (Required for compliance log, at least 3 characters):
            </label>
            <input
              type="text"
              required
              minLength={3}
              placeholder="Explain why this module needs to change"
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
            <Button variant={moduleToToggle?.isEnabled ? 'danger' : 'primary'} onClick={handleConfirmToggle} disabled={isToggling || toggleReason.trim().length < 3}>
              {isToggling ? 'Updating...' : `Confirm ${moduleToToggle?.isEnabled ? 'Disable' : 'Enable'}`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

