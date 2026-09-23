import React, { useState, useEffect, useCallback } from 'react';
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
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // Filter States
  const [actionFilter, setActionFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [fromTime, setFromTime] = useState('');
  const [toDate, setToDate] = useState('');
  const [toTime, setToTime] = useState('');

  // Server-Side Pagination States (Section 11: 50-70 records per page)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const fetchLogs = useCallback(async (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    try {
      const params = {
        action: actionFilter ? actionFilter : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        fromTime: fromTime || undefined,
        toTime: toTime || undefined,
        page: targetPage,
        pageSize: targetPageSize,
      };

      const res = await auditService.getLogs(params);
      setLogs(res.data || []);
      const totalCount = res.pagination?.total ?? res.meta?.total ?? res.data?.length ?? 0;
      const pagesCount = res.pagination?.totalPages ?? Math.ceil(totalCount / targetPageSize) ?? 1;
      setTotal(totalCount);
      setTotalPages(Math.max(1, pagesCount));
    } catch (err) {
      addToast(`Unable to fetch audit logs: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, fromDate, fromTime, toDate, toTime, page, pageSize, addToast]);

  useEffect(() => {
    fetchLogs(page, pageSize);
  }, [page, pageSize, actionFilter, fromDate, fromTime, toDate, toTime, currentRole]);

  const handleActionChange = (e) => {
    setActionFilter(e.target.value);
    setPage(1);
  };

  const handleFromDateChange = (e) => {
    setFromDate(e.target.value);
    setPage(1);
  };

  const handleFromTimeChange = (e) => {
    setFromTime(e.target.value);
    setPage(1);
  };

  const handleToDateChange = (e) => {
    setToDate(e.target.value);
    setPage(1);
  };

  const handleToTimeChange = (e) => {
    setToTime(e.target.value);
    setPage(1);
  };

  const handlePageSizeChange = (e) => {
    const newSize = parseInt(e.target.value, 10);
    setPageSize(newSize);
    setPage(1);
  };

  const handleClearFilters = () => {
    setActionFilter('');
    setFromDate('');
    setFromTime('');
    setToDate('');
    setToTime('');
    setPage(1);
  };

  const isPermitted = ['admin', 'manager', 'owner', 'super_admin'].includes(currentRole.toLowerCase());

  const columns = [
    { header: 'ID', key: 'id', width: '60px' },
    {
      header: 'Timestamp (UTC)',
      key: 'created_at',
      width: '175px',
      render: (val) => (
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {val ? new Date(val).toISOString().replace('T', ' ').slice(0, 19) : '—'}
        </span>
      ),
    },
    {
      header: 'Actor',
      key: 'actor_role',
      width: '130px',
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
      render: (val) => {
        let badgeStatus = 'available';
        if (val?.includes('FAILED') || val?.includes('CANCEL') || val?.includes('DELETE')) badgeStatus = 'cancelled';
        else if (val?.includes('LOGIN') || val?.includes('LOGOUT')) badgeStatus = 'occupied';
        else if (val?.includes('RESERVATION') || val?.includes('CREATE')) badgeStatus = 'reserved';
        return <Badge status={badgeStatus}>{val}</Badge>;
      },
    },
    {
      header: 'Target Entity',
      key: 'entity_type',
      render: (val, row) => (
        <span style={{ textTransform: 'capitalize' }}>
          {val} #{row.entity_id || 'N/A'}
        </span>
      ),
    },
    {
      header: 'Trace Request ID',
      key: 'request_id',
      render: (val) => (
        <code style={{ fontSize: '0.76rem', background: 'var(--bg-card-hover)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-primary)', wordBreak: 'break-all', display: 'inline-block', maxWidth: '160px' }}>
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

  const startRecord = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, total);

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
        <Button variant="outline" size="sm" onClick={() => fetchLogs(page, pageSize)} loading={loading}>
          ↻ Refresh Logs
        </Button>
      </div>

      {/* Filter Control Panel */}
      <Card style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Controls Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
              gap: '0.75rem',
              alignItems: 'end',
            }}
          >
            {/* Action Filter */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Action
              </label>
              <select
                id="audit-action-filter"
                value={actionFilter}
                onChange={handleActionChange}
                style={{
                  width: '100%',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  padding: '7px 10px',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  minHeight: '40px',
                }}
              >
                <option value="">All Actions</option>
                <option value="LOGIN">Login</option>
                <option value="LOGOUT">Logout</option>
                <option value="FAILED_LOGIN">Failed Login</option>
                <option value="CREATE">Create</option>
                <option value="UPDATE">Update</option>
                <option value="DELETE">Delete</option>
                <option value="VIEW">View</option>
                <option value="RESERVATION_ACTIONS">Reservation Actions</option>
                <option value="PAYMENT_ACTIONS">Payment Actions</option>
                <option value="EXPENSE_ACTIONS">Expense Actions</option>
                <option value="USER_ACTIONS">User Actions</option>
                <option value="PROPERTY_ACTIONS">Property Actions</option>
                <option value="APARTMENT_ACTIONS">Apartment Actions</option>
                <option value="MAINTENANCE_ACTIONS">Maintenance Actions</option>
                <option value="INSPECTION_ACTIONS">Inspection Actions</option>
                <option value="SETTINGS_ACTIONS">Settings Actions</option>
              </select>
            </div>

            {/* From Date */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                From Date
              </label>
              <input
                id="audit-from-date"
                type="date"
                value={fromDate}
                onChange={handleFromDateChange}
                style={{
                  width: '100%',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  minHeight: '40px',
                }}
              />
            </div>

            {/* From Time */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                From Time
              </label>
              <input
                id="audit-from-time"
                type="time"
                value={fromTime}
                onChange={handleFromTimeChange}
                style={{
                  width: '100%',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  minHeight: '40px',
                }}
              />
            </div>

            {/* To Date */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                To Date
              </label>
              <input
                id="audit-to-date"
                type="date"
                value={toDate}
                onChange={handleToDateChange}
                style={{
                  width: '100%',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  minHeight: '40px',
                }}
              />
            </div>

            {/* To Time */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                To Time
              </label>
              <input
                id="audit-to-time"
                type="time"
                value={toTime}
                onChange={handleToTimeChange}
                style={{
                  width: '100%',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  minHeight: '40px',
                }}
              />
            </div>

            {/* Clear Filters Button */}
            <div style={{ display: 'flex', alignItems: 'end' }}>
              <Button
                id="audit-clear-filters-btn"
                variant="outline"
                size="sm"
                onClick={handleClearFilters}
                style={{ width: '100%', minHeight: '40px' }}
              >
                ✕ Clear Filters
              </Button>
            </div>
          </div>

          {/* Active Status Summary */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--border-subtle)',
              fontSize: '0.85rem',
            }}
          >
            <div style={{ color: 'var(--text-muted)' }}>
              Showing: <strong style={{ color: 'var(--text-primary)' }}>{actionFilter || 'All Actions'}</strong>
              {fromDate && <span> • From: {fromDate} {fromTime || '00:00'}</span>}
              {toDate && <span> • To: {toDate} {toTime || '23:59'}</span>}
            </div>
            <div style={{ color: 'var(--text-muted)' }}>
              Total Authorized Records: <strong style={{ color: 'var(--brand-accent)' }}>{total}</strong>
            </div>
          </div>
        </div>
      </Card>

      {/* Audit Log Table Card */}
      <Card title="Audit Event Journal">
        {loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading audit journal records...
          </div>
        ) : (
          <>
            <Table columns={columns} data={logs} emptyMessage="No audit logs matched the selected filters." />

            {/* Server-Side Pagination Controls (Section 10, 11, 12, 13) */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
                marginTop: '1.25rem',
                paddingTop: '1rem',
                borderTop: '1px solid var(--border-subtle)',
                fontSize: '0.88rem',
              }}
            >
              {/* Record Summary */}
              <div style={{ color: 'var(--text-secondary)' }}>
                Showing <strong style={{ color: 'var(--text-primary)' }}>{startRecord}–{endRecord}</strong> of{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{total}</strong> records
              </div>

              {/* Page Selector & Navigation */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Button
                  id="audit-page-first"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(1)}
                  disabled={page <= 1 || loading}
                >
                  « First
                </Button>
                <Button
                  id="audit-page-prev"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                >
                  ‹ Prev
                </Button>

                <span style={{ padding: '0 6px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Page {page} of {totalPages}
                </span>

                <Button
                  id="audit-page-next"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                >
                  Next ›
                </Button>
                <Button
                  id="audit-page-last"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages || loading}
                >
                  Last »
                </Button>

                {/* Page Size Selector (50–70 records/page) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Per page:</span>
                  <select
                    id="audit-page-size-select"
                    value={pageSize}
                    onChange={handlePageSizeChange}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-default)',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                    }}
                  >
                    <option value="50">50</option>
                    <option value="60">60</option>
                    <option value="70">70</option>
                  </select>
                </div>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
