import React, { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Table from '../components/ui/Table';
import { auditService } from '../services/api';
import { useRole } from '../context/RoleContext';
import { useToast } from '../context/ToastContext';

export default function AuditPage() {
  const { currentRole } = useRole();
  const { addToast } = useToast();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await auditService.getLogs({ action: actionFilter || undefined });
      setLogs(res.data);
      setTotal(res.meta?.total || res.data.length);
    } catch (err) {
      addToast(`Unable to fetch audit logs: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, currentRole]);

  const isPermitted = ['admin', 'manager', 'owner'].includes(currentRole.toLowerCase());

  const columns = [
    { header: 'ID', key: 'id', width: '60px' },
    {
      header: 'Timestamp',
      key: 'created_at',
      width: '180px',
      render: (val) => <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{val}</span>,
    },
    {
      header: 'Actor',
      key: 'actor_role',
      width: '120px',
      render: (val, row) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--brand-accent)' }}>{val || 'SYSTEM'}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.actor_email || 'internal'}</div>
        </div>
      ),
    },
    {
      header: 'Action',
      key: 'action',
      render: (val) => <Badge status="occupied">{val}</Badge>,
    },
    {
      header: 'Target Entity',
      key: 'entity_type',
      render: (val, row) => (
        <span>
          {val} #{row.entity_id || 'N/A'}
        </span>
      ),
    },
    {
      header: 'Trace Request ID',
      key: 'request_id',
      render: (val) => (
        <code style={{ fontSize: '0.76rem', background: 'var(--bg-card-hover)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-primary)', wordBreak: 'break-all', display: 'inline-block', maxWidth: '180px' }}>
          {val || 'internal'}
        </code>
      ),
    },
  ];

  if (!isPermitted) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">
            <span>Audit Trail</span>
            <Badge status="cancelled">RESTRICTED</Badge>
          </h1>
        </div>
        <Card>
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem', color: 'var(--rust-light)' }}>🔒</div>
            <h3 style={{ marginBottom: '0.5rem' }}>Access Denied</h3>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto' }}>
              Your current role (<strong>{currentRole.toUpperCase()}</strong>) does not have authorization to view the administrative audit trail. Only Admin, Manager, and Owner roles are permitted.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span>System Audit Trail</span>
            <Badge status="available">APPEND-ONLY SECURED</Badge>
          </h1>
          <p className="page-subtitle">
            Immutable business and security audit records correlated with Request Tracing.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} loading={loading}>
          ↻ Refresh Audit Logs
        </Button>
      </div>

      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Filter Action:</span>
            <select
              className="property-select"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
            >
              <option value="">All Actions</option>
              <option value="RESERVATION_CREATED">RESERVATION_CREATED</option>
              <option value="USER_LOGIN">USER_LOGIN</option>
              <option value="SETTINGS_UPDATE">SETTINGS_UPDATE</option>
            </select>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Total Audit Records: <strong style={{ color: 'var(--text-primary)' }}>{total}</strong>
          </div>
        </div>
      </Card>

      <Card title="Audit Event Journal">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading audit journal...
          </div>
        ) : (
          <Table columns={columns} data={logs} emptyMessage="No audit logs recorded yet." />
        )}
      </Card>
    </div>
  );
}
