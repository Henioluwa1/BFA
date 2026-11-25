import React, { useState, useEffect, useCallback } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Table from '../ui/Table';
import Modal from '../ui/Modal';
import InChatOperationDetailsModal from '../chat/InChatOperationDetailsModal';
import { centralOperationsService, operationsService, employeeService, propertyService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useProperty } from '../../context/PropertyContext';
import { useToast } from '../../context/ToastContext';
import {
  CheckCircle,
  Plus,
  AlertTriangle,
  Clock,
  RefreshCw,
  Star,
  Check,
  Building,
  User,
  Wrench,
  ShieldAlert,
  Ticket,
  Settings,
  ExternalLink,
} from 'lucide-react';

const formatWatTime = (iso) => {
  if (!iso) return '—';
  try {
    return `${new Intl.DateTimeFormat('en-NG', {
      timeZone: 'Africa/Lagos',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))} WAT`;
  } catch {
    return String(iso);
  }
};

const TICKET_FILTER_TABS = [
  { id: 'ALL', label: 'All Tickets' },
  { id: 'MY_TICKETS', label: 'My Tickets' },
  { id: 'OPEN', label: 'Open' },
  { id: 'AWAITING_ACK', label: 'Awaiting Acknowledgment' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'PENDING_REVIEW', label: 'Pending Review' },
  { id: 'OVERDUE', label: 'Overdue' },
  { id: 'ESCALATED', label: 'Escalated' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'REASSIGNED', label: 'Reassigned' },
  { id: 'CLOSED', label: 'Closed' },
];

const TASK_CATEGORIES = [
  { value: 'CLEANING', label: 'Cleaning & Turnover' },
  { value: 'MAINTENANCE', label: 'Maintenance & Repairs' },
  { value: 'INSPECTION', label: 'Apartment Inspection' },
  { value: 'READINESS', label: 'Guest Arrival Readiness' },
  { value: 'ERRAND', label: 'Supplies / Logistics Errand' },
  { value: 'GENERAL', label: 'General Property Operations' },
];

export default function OperationalTasksTab({ activePropertyId }) {
  const { user } = useAuth();
  const { properties } = useProperty();
  const { addToast } = useToast();

  const userRole = (user?.role || '').toUpperCase();
  const isOwnerOrSuper = ['OWNER', 'SUPER_ADMIN'].includes(userRole);
  const isManagement = ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATIONS_MANAGER'].includes(userRole);

  const [tasks, setTasks] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [ticketFilter, setTicketFilter] = useState('ALL');
  const [ticketSearch, setTicketSearch] = useState('');
  const [slaModalOpen, setSlaModalOpen] = useState(false);
  const [slaConfig, setSlaConfig] = useState({ CRITICAL: 3, URGENT: 6, HIGH: 6, IMPORTANT: 12, NORMAL: 12, LOW: 24 });
  const [savingSla, setSavingSla] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewingOperationId, setViewingOperationId] = useState(null);

  // Create Task Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [createForm, setCreateForm] = useState({
    property_id: activePropertyId !== 'all' ? activePropertyId : '',
    title: '',
    description: '',
    category: 'CLEANING',
    priority: 'NORMAL',
    assigned_to_user_id: '',
    deadline: '',
  });

  // Resolve Blocker Modal
  const [resolveBlockerTarget, setResolveBlockerTarget] = useState(null);
  const [resolvingBlocker, setResolvingBlocker] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');

  // Manager Review Task Modal
  const [reviewTaskTarget, setReviewTaskTarget] = useState(null);
  const [reviewingTask, setReviewingTask] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewNotes, setReviewNotes] = useState('');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const propId = activePropertyId !== 'all' ? activePropertyId : undefined;
      const [tasksRes, opsRes] = await Promise.all([
        operationsService.listTasks({ propertyId: propId }),
        centralOperationsService.listOperations({ view: 'all', property_id: propId }).catch(() => ({ data: [] })),
      ]);
      setTasks(tasksRes.data?.data?.tasks || tasksRes.data?.tasks || []);
      const opsList = opsRes?.data?.data || opsRes?.data || (Array.isArray(opsRes) ? opsRes : []);
      setTickets(Array.isArray(opsList) ? opsList : []);
    } catch (err) {
      addToast(err.message || 'Failed to load operational workspace', 'error');
    } finally {
      setLoading(false);
    }
  }, [activePropertyId, addToast]);

  const fetchSlaConfig = useCallback(async () => {
    try {
      const res = await centralOperationsService.getAckSlaConfig();
      const cfg = res?.data?.data || res?.data || res;
      if (cfg && typeof cfg === 'object') {
        setSlaConfig((prev) => ({ ...prev, ...cfg }));
      }
    } catch {
      // keep defaults silently
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await employeeService.getEmployees();
      setEmployees(res.data?.employees || res.data?.data || res.data || []);
    } catch (err) {
      console.warn('Failed to load employees:', err.message);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchEmployees();
    fetchSlaConfig();
  }, [fetchTasks, fetchEmployees, fetchSlaConfig]);

  const handleSaveSlaConfig = async (e) => {
    e.preventDefault();
    setSavingSla(true);
    try {
      await centralOperationsService.updateAckSlaConfig(slaConfig);
      addToast('Priority Acknowledgment SLA rules updated (Africa/Lagos).', 'success');
      setSlaModalOpen(false);
      fetchSlaConfig();
    } catch (err) {
      addToast(err.response?.data?.message || err.message || 'Failed to update SLA config.', 'error');
    } finally {
      setSavingSla(false);
    }
  };

  const currentUserId = Number(user?.id);
  const nowMs = Date.now();
  const isTicketMatchesTab = (t, tabId) => {
    const st = String(t.status || '').toUpperCase();
    const isTerminal = ['COMPLETED', 'CLOSED', 'CANCELLED', 'REJECTED'].includes(st);
    const isOverdue = !isTerminal && (
      st === 'OVERDUE' ||
      (t.deadline_at && new Date(t.deadline_at).getTime() < nowMs) ||
      (!t.first_acknowledged_at && (t.acknowledgment_deadline_at || t.ack_deadline_at) && new Date(t.acknowledgment_deadline_at || t.ack_deadline_at).getTime() < nowMs)
    );
    switch (tabId) {
      case 'MY_TICKETS':
        return Number(t.current_responsible_user_id) === currentUserId || (Number(t.total_recipients || 0) > 0 && t.my_acknowledged_at !== undefined);
      case 'OPEN':
        return ['OPEN', 'ISSUED', 'ASSIGNED', 'REOPENED'].includes(st);
      case 'AWAITING_ACK':
        return !isTerminal && !t.first_acknowledged_at && ['OPEN', 'ISSUED', 'ASSIGNED', 'AWAITING_OWNERSHIP', 'AWAITING_ACKNOWLEDGEMENT'].includes(st);
      case 'IN_PROGRESS':
        return ['IN_PROGRESS', 'ACCEPTED', 'ACKNOWLEDGED', 'AWAITING_CLARIFICATION', 'PENDING_CLARIFICATION', 'EXTENSION_REQUESTED'].includes(st);
      case 'PENDING_REVIEW':
        return ['SUBMITTED_FOR_REVIEW', 'AWAITING_REVIEW', 'PENDING_APPROVAL'].includes(st);
      case 'OVERDUE':
        return isOverdue;
      case 'ESCALATED':
        return !isTerminal && (st === 'ESCALATED' || Boolean(t.escalated_at));
      case 'COMPLETED':
        return st === 'COMPLETED';
      case 'REASSIGNED':
        return Number(t.reassignment_count || 0) > 0;
      case 'CLOSED':
        return ['CLOSED', 'CANCELLED', 'REJECTED'].includes(st);
      default:
        return true;
    }
  };

  const filteredTickets = tickets.filter((t) => {
    if (!isTicketMatchesTab(t, ticketFilter)) return false;
    if (!ticketSearch.trim()) return true;
    const q = ticketSearch.trim().toLowerCase();
    return (
      String(t.title || '').toLowerCase().includes(q) ||
      String(t.ticket_reference || '').toLowerCase().includes(q) ||
      String(t.operation_code || '').toLowerCase().includes(q) ||
      String(t.responsible_name || '').toLowerCase().includes(q)
    );
  });

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!createForm.property_id || !createForm.title) {
      addToast('Please enter task property and title', 'error');
      return;
    }
    setSavingTask(true);
    try {
      await operationsService.createTask(createForm);
      addToast('Operational task created and assigned!', 'success');
      setIsCreateOpen(false);
      setCreateForm({
        property_id: activePropertyId !== 'all' ? activePropertyId : '',
        title: '',
        description: '',
        category: 'CLEANING',
        priority: 'NORMAL',
        assigned_to_user_id: '',
        deadline: '',
      });
      fetchTasks();
    } catch (err) {
      addToast(err.message || 'Failed to create task', 'error');
    } finally {
      setSavingTask(false);
    }
  };

  const handleResolveBlocker = async (e) => {
    e.preventDefault();
    if (!resolutionNotes) {
      addToast('Please enter blocker resolution details', 'error');
      return;
    }
    setResolvingBlocker(true);
    try {
      await operationsService.resolveBlocker(resolveBlockerTarget.blocker_id, { resolution_notes: resolutionNotes });
      addToast('Blocker marked resolved and task unblocked!', 'success');
      setResolveBlockerTarget(null);
      setResolutionNotes('');
      fetchTasks();
    } catch (err) {
      addToast(err.message || 'Failed to resolve blocker', 'error');
    } finally {
      setResolvingBlocker(false);
    }
  };

  const handleReviewTask = async (e) => {
    e.preventDefault();
    setReviewingTask(true);
    try {
      await operationsService.reviewTask(reviewTaskTarget.id, {
        manager_rating: reviewRating,
        manager_notes: reviewNotes,
      });
      addToast('Task verified and signed off successfully!', 'success');
      setReviewTaskTarget(null);
      setReviewNotes('');
      fetchTasks();
    } catch (err) {
      addToast(err.message || 'Failed to review task', 'error');
    } finally {
      setReviewingTask(false);
    }
  };

  const renderStatus = (val) => {
    if (!val) return '—';
    const s = String(val).toUpperCase();
    if (['COMPLETED', 'VERIFIED'].includes(s)) {
      return <Badge status="success">{val}</Badge>;
    }
    if (['IN_PROGRESS'].includes(s)) {
      return <Badge status="pending">{val}</Badge>;
    }
    if (['BLOCKED'].includes(s)) {
      return <Badge status="danger">⚠️ BLOCKED</Badge>;
    }
    if (['CANCELLED'].includes(s)) {
      return <Badge status="danger">{val}</Badge>;
    }
    return <Badge status="neutral">{val}</Badge>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle size={20} style={{ color: '#10b981' }} />
            <span>Operational Tasks & Blocker Management</span>
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
            Daily property operations, cleaning, readiness, repairs, active blocker resolution, and manager sign-off.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {isOwnerOrSuper && (
            <Button variant="outline" size="sm" onClick={() => setSlaModalOpen(true)} icon={<Settings size={14} />}>
              Priority Ack SLA
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={fetchTasks} icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}>
            Refresh
          </Button>
          {isManagement && (
            <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)} icon={<Plus size={16} />}>
              Create Operational Task
            </Button>
          )}
        </div>
      </div>

      {/* ─── UNIFIED OPERATIONS TICKETING QUEUE ──────────────────────────────── */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Ticket size={18} style={{ color: '#60a5fa' }} />
              Unified Operations Tickets ({filteredTickets.length})
            </span>
            <input
              type="text"
              value={ticketSearch}
              onChange={(e) => setTicketSearch(e.target.value)}
              placeholder="Search ticket ref, title, owner..."
              style={{
                padding: '0.35rem 0.7rem',
                borderRadius: '6px',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.78rem',
                minWidth: '210px',
              }}
            />
          </div>
        }
      >
        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {TICKET_FILTER_TABS.map((tab) => {
            const count = tickets.filter((t) => isTicketMatchesTab(t, tab.id)).length;
            const active = ticketFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTicketFilter(tab.id)}
                style={{
                  padding: '0.35rem 0.7rem',
                  borderRadius: '999px',
                  fontSize: '0.74rem',
                  fontWeight: active ? 700 : 500,
                  border: active ? '1px solid #3b82f6' : '1px solid var(--border-default)',
                  background: active ? 'rgba(59, 130, 246, 0.18)' : 'transparent',
                  color: active ? '#60a5fa' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <span>{tab.label}</span>
                <span style={{ opacity: 0.75, fontSize: '0.68rem' }}>({count})</span>
              </button>
            );
          })}
        </div>

        {loading && tickets.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading operational tickets...</div>
        ) : filteredTickets.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No operational tickets match this filter.
          </div>
        ) : (
          <Table
            columns={[
              {
                header: 'Ticket Ref & Title',
                key: 'ticket_reference',
                render: (val, row) => (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.75rem', color: '#60a5fa' }}>
                        {val || row.operation_code}
                      </span>
                      {row.escalated_at && (
                        <Badge status="danger">ESCALATED</Badge>
                      )}
                      {Number(row.reassignment_count || 0) > 0 && (
                        <Badge status="warning">Reassigned ×{row.reassignment_count}</Badge>
                      )}
                    </div>
                    <strong style={{ display: 'block', marginTop: '2px' }}>{row.title}</strong>
                    {row.viewer_next_action?.text && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Next: {row.viewer_next_action.text}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                header: 'Priority',
                key: 'priority',
                render: (val) => (
                  <Badge status={['CRITICAL', 'URGENT', 'HIGH'].includes(String(val).toUpperCase()) ? 'danger' : val === 'IMPORTANT' ? 'warning' : 'neutral'}>
                    {val}
                  </Badge>
                ),
              },
              {
                header: 'Responsible',
                key: 'responsible_name',
                render: (val, row) => val || row.current_responsible_group || 'Unassigned',
              },
              {
                header: 'Ack SLA / Target Due',
                key: 'acknowledgment_deadline_at',
                render: (val, row) => (
                  <div style={{ fontSize: '0.74rem' }}>
                    <div style={{ color: row.first_acknowledged_at ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                      {row.first_acknowledged_at ? `Ack: ${formatWatTime(row.first_acknowledged_at)}` : `Ack Due: ${formatWatTime(val || row.ack_deadline_at)}`}
                    </div>
                    {row.deadline_at && (
                      <div style={{ color: 'var(--text-muted)' }}>Due: {formatWatTime(row.deadline_at)}</div>
                    )}
                  </div>
                ),
              },
              {
                header: 'Status',
                key: 'status',
                render: renderStatus,
              },
              {
                header: 'Ticket Drawer',
                key: 'id',
                render: (id) => (
                  <Button size="sm" variant="primary" onClick={() => setViewingOperationId(id)} icon={<ExternalLink size={13} />}>
                    Manage Ticket
                  </Button>
                ),
              },
            ]}
            data={filteredTickets}
          />
        )}
      </Card>

      <Card title="Daily Property Tasks & Linked Ticket Execution">
        {loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading operational tasks...
          </div>
        ) : tasks.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No operational tasks found for the selected scope.
          </div>
        ) : (
          <Table
            columns={[
              {
                header: 'Task Title',
                key: 'title',
                render: (val, row) => (
                  <div>
                    <strong style={{ display: 'block' }}>{val}</strong>
                    {row.central_operation_id && (
                      <button
                        type="button"
                        onClick={() => setViewingOperationId(row.central_operation_id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'rgba(59, 130, 246, 0.15)',
                          border: '1px solid rgba(59, 130, 246, 0.4)',
                          borderRadius: '4px',
                          padding: '1px 6px',
                          fontSize: '0.68rem',
                          color: '#60a5fa',
                          fontWeight: 800,
                          marginTop: '3px',
                          cursor: 'pointer',
                        }}
                        title="Click to view full operational directive and memorandum"
                      >
                        ⚡ OPERATION DIRECTIVE {row.operation_code ? `· ${row.operation_code}` : ''}
                      </button>
                    )}
                    {row.has_active_blocker && (
                      <div style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 600, marginTop: '0.2rem' }}>
                        ⚠️ BLOCKED: {row.blocker_category} - {row.blocker_description}
                      </div>
                    )}
                  </div>
                ),
              },
              { header: 'Property', key: 'property_name', render: (val) => val || '—' },
              { header: 'Category', key: 'category' },
              {
                header: 'Priority',
                key: 'priority',
                render: (val) => (
                  <Badge status={val === 'URGENT' ? 'danger' : val === 'IMPORTANT' ? 'warning' : 'neutral'}>
                    {val}
                  </Badge>
                ),
              },
              { header: 'Assigned To', key: 'assigned_to_name', render: (val) => val || 'Unassigned' },
              { header: 'Status', key: 'status', render: renderStatus },
              {
                header: 'Actions',
                key: 'id',
                render: (id, row) => (
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {row.central_operation_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setViewingOperationId(row.central_operation_id)}
                      >
                        Directive
                      </Button>
                    )}
                    {row.has_active_blocker && isManagement && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setResolveBlockerTarget(row);
                          setResolutionNotes('');
                        }}
                      >
                        Resolve Blocker
                      </Button>
                    )}
                    {row.status === 'COMPLETED' && !row.manager_rating && isManagement && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setReviewTaskTarget(row);
                          setReviewRating(5);
                          setReviewNotes('');
                        }}
                      >
                        Sign-Off
                      </Button>
                    )}
                    {row.manager_rating && (
                      <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 600 }}>
                        ★ {row.manager_rating}/5 Signed
                      </span>
                    )}
                  </div>
                ),
              },
            ]}
            data={tasks}
          />
        )}
      </Card>

      {/* ─── MODAL: CREATE TASK ────────────────────────────────────────────── */}
      {isCreateOpen && (
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Create Operational Task"
        >
          <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Property *
                </label>
                <select
                  value={createForm.property_id}
                  onChange={(e) => setCreateForm({ ...createForm, property_id: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="">Select Property...</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Category *
                </label>
                <select
                  value={createForm.category}
                  onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {TASK_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Task Title *
              </label>
              <input
                type="text"
                value={createForm.title}
                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                required
                placeholder="e.g. Disinfect and replenish amenities in Apt 3B before 2 PM"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Assign To Staff
                </label>
                <select
                  value={createForm.assigned_to_user_id}
                  onChange={(e) => setCreateForm({ ...createForm, assigned_to_user_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="">Unassigned (Open Queue)</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.user_id || emp.id}>
                      {emp.first_name} {emp.last_name} ({emp.role || emp.designation || 'Staff'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Priority
                </label>
                <select
                  value={createForm.priority}
                  onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="NORMAL">Normal</option>
                  <option value="IMPORTANT">Important</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Task Details & Checklist
              </label>
              <textarea
                rows={3}
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                placeholder="Include room inspection points, inventory checklists, or specific instructions..."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="secondary" type="button" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={savingTask}>
                {savingTask ? 'Creating...' : 'Create Task'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── MODAL: RESOLVE BLOCKER ────────────────────────────────────────── */}
      {resolveBlockerTarget && (
        <Modal
          isOpen={Boolean(resolveBlockerTarget)}
          onClose={() => setResolveBlockerTarget(null)}
          title="Resolve Operational Blocker"
        >
          <form onSubmit={handleResolveBlocker} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: '#ef4444' }}>Blocker Reported:</strong>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                [{resolveBlockerTarget.blocker_category}] {resolveBlockerTarget.blocker_description}
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Resolution Actions Taken *
              </label>
              <textarea
                rows={4}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                required
                placeholder="e.g. Procured replacement linen from central depot and granted access code..."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="secondary" type="button" onClick={() => setResolveBlockerTarget(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={resolvingBlocker}>
                {resolvingBlocker ? 'Resolving...' : 'Confirm Resolution & Unblock Task'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── MODAL: MANAGER SIGN-OFF ───────────────────────────────────────── */}
      {reviewTaskTarget && (
        <Modal
          isOpen={Boolean(reviewTaskTarget)}
          onClose={() => setReviewTaskTarget(null)}
          title={`Manager Sign-Off: ${reviewTaskTarget.title}`}
        >
          <form onSubmit={handleReviewTask} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Execution Quality Rating (1 - 5)
              </label>
              <select
                value={reviewRating}
                onChange={(e) => setReviewRating(parseInt(e.target.value, 10))}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="5">5 - Excellent / Flawless</option>
                <option value="4">4 - Good / Met Standards</option>
                <option value="3">3 - Satisfactory / Minor Remediation</option>
                <option value="2">2 - Needs Improvement</option>
                <option value="1">1 - Unsatisfactory</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Manager Sign-Off Remarks
              </label>
              <textarea
                rows={3}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Provide feedback, quality observations, or turnover notes..."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="secondary" type="button" onClick={() => setReviewTaskTarget(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={reviewingTask}>
                {reviewingTask ? 'Signing Off...' : 'Complete Sign-Off'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── MODAL: OWNER PRIORITY ACK SLA SETTINGS ───────────────────────── */}
      {slaModalOpen && isOwnerOrSuper && (
        <Modal
          isOpen={slaModalOpen}
          onClose={() => setSlaModalOpen(false)}
          title="Priority Acknowledgment SLA Configuration (3–24 Hours)"
        >
          <form onSubmit={handleSaveSlaConfig} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Set how many hours recipients have to acknowledge new operational tickets before reminder & hierarchical escalation triggers (Africa/Lagos).
            </p>
            {['CRITICAL', 'URGENT', 'HIGH', 'IMPORTANT', 'NORMAL', 'LOW'].map((prio) => (
              <div key={prio} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>{prio} Priority (hours)</label>
                <input
                  type="number"
                  min={3}
                  max={24}
                  value={slaConfig[prio] ?? 12}
                  onChange={(e) => setSlaConfig((prev) => ({ ...prev, [prio]: Number(e.target.value) }))}
                  style={{
                    width: '90px',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="secondary" type="button" onClick={() => setSlaModalOpen(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={savingSla}>
                {savingSla ? 'Saving...' : 'Save SLA Settings'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── MODAL: IN-CHAT OPERATION DETAILS MODAL ───────────────────────── */}
      <InChatOperationDetailsModal
        isOpen={Boolean(viewingOperationId)}
        onClose={() => setViewingOperationId(null)}
        operationId={viewingOperationId}
        currentUser={user}
        onOperationUpdated={fetchTasks}
      />
    </div>
  );
}
