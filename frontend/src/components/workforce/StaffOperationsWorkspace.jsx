import React, { useState, useEffect, useCallback } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Table from '../ui/Table';
import Modal from '../ui/Modal';
import InChatOperationDetailsModal from '../chat/InChatOperationDetailsModal';
import { centralOperationsService, operationsService, reportService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useProperty } from '../../context/PropertyContext';
import { useToast } from '../../context/ToastContext';
import {
  Building,
  CheckCircle,
  AlertTriangle,
  Clock,
  Download,
  FileText,
  Send,
  RefreshCw,
  MessageSquare,
  Check,
  X,
  HelpCircle,
} from 'lucide-react';

const BLOCKER_CATEGORIES = [
  { value: 'MATERIALS', label: 'Materials / Supplies Shortage' },
  { value: 'ACCESS', label: 'Access / Key / Lockout' },
  { value: 'SAFETY', label: 'Safety / Hazard Concern' },
  { value: 'UTILITIES', label: 'Utilities Outage (Power / Water / Internet)' },
  { value: 'WEATHER', label: 'Adverse Weather' },
  { value: 'OTHER', label: 'Other Operational Obstacle' },
];

export default function StaffOperationsWorkspace() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [activeSubTab, setActiveSubTab] = useState('ASSIGNMENT'); // 'ASSIGNMENT', 'TASKS', 'REPORT'
  const [loading, setLoading] = useState(false);

  // Assignment State
  const [myAssignments, setMyAssignments] = useState([]);
  const [rejectModalId, setRejectModalId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [clarificationModalId, setClarificationModalId] = useState(null);
  const [clarificationNotes, setClarificationNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // My Tasks & Tickets State
  const [myTasks, setMyTasks] = useState([]);
  const [myTickets, setMyTickets] = useState([]);
  const [ticketFilter, setTicketFilter] = useState('MY_TICKETS');
  const [viewingOperationId, setViewingOperationId] = useState(null);
  const [blockerModalTask, setBlockerModalTask] = useState(null);
  const [blockerForm, setBlockerForm] = useState({
    blocker_category: 'MATERIALS',
    description: '',
    estimated_delay_hours: 1,
  });
  const [submittingBlocker, setSubmittingBlocker] = useState(false);

  // End-of-Shift Report State
  const [myReports, setMyReports] = useState([]);
  const [reportForm, setReportForm] = useState({
    property_id: '',
    shift_date: new Date().toISOString().split('T')[0],
    role_classification: 'GENERAL_STAFF',
    content: '',
  });
  const [submittingReport, setSubmittingReport] = useState(false);

  const fetchOperationalData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Assignments
      const resAssignments = await operationsService.listAssignments({ myAssignmentsOnly: true });
      const assignList = resAssignments.data?.data?.assignments || resAssignments.data?.assignments || [];
      setMyAssignments(assignList);

      // Pre-populate report property if assigned
      if (assignList.length > 0 && !reportForm.property_id) {
        setReportForm((prev) => ({
          ...prev,
          property_id: assignList[0].property_id,
          role_classification: assignList[0].duty_classification || 'GENERAL_STAFF',
        }));
      }

      // 2. Fetch Tasks & Unified Tickets assigned to/visible by user
      const [resTasks, resTickets] = await Promise.all([
        operationsService.listTasks({ assignedToMe: true }),
        centralOperationsService.listOperations({ view: 'myTickets' }).catch(() => ({ data: [] })),
      ]);
      setMyTasks(resTasks.data?.data?.tasks || resTasks.data?.tasks || []);
      const ticketRows = resTickets?.data?.data || resTickets?.data || (Array.isArray(resTickets) ? resTickets : []);
      setMyTickets(Array.isArray(ticketRows) ? ticketRows : []);

      // 3. Fetch My Submitted Reports
      const resReports = await operationsService.listStaffReports({ myReportsOnly: true });
      setMyReports(resReports.data?.data?.reports || resReports.data?.reports || []);
    } catch (err) {
      console.warn('Failed to load staff operations data:', err.message);
    } finally {
      setLoading(false);
    }
  }, [reportForm.property_id]);

  useEffect(() => {
    fetchOperationalData();
  }, [fetchOperationalData]);

  // Handle Assignment Status Update
  const handleUpdateAssignmentStatus = async (assignmentId, status, extra = {}) => {
    setUpdatingStatus(true);
    try {
      await operationsService.updateAssignmentStatus(assignmentId, { status, ...extra });
      addToast(`Assignment status updated to ${status}`, 'success');
      setRejectModalId(null);
      setRejectionReason('');
      setClarificationModalId(null);
      setClarificationNotes('');
      fetchOperationalData();
    } catch (err) {
      addToast(err.message || 'Failed to update assignment status', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Download Assignment PDF
  const handleDownloadPdf = async (assignmentId) => {
    setDownloadingPdf(true);
    try {
      addToast('Downloading official assignment notice PDF...', 'info');
      await operationsService.downloadAssignmentPdf(assignmentId);
      addToast('Notice downloaded successfully', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to download assignment PDF', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Handle Task Progress Update
  const handleUpdateTaskProgress = async (taskId, status) => {
    try {
      await operationsService.updateTaskProgress(taskId, { status });
      addToast(`Task marked as ${status}`, 'success');
      fetchOperationalData();
    } catch (err) {
      addToast(err.message || 'Failed to update task progress', 'error');
    }
  };

  // Submit Blocker
  const handleSubmitBlocker = async (e) => {
    e.preventDefault();
    if (!blockerForm.description) {
      addToast('Please describe the blocker encountered', 'error');
      return;
    }
    setSubmittingBlocker(true);
    try {
      await operationsService.reportBlocker(blockerModalTask.id, blockerForm);
      addToast('Operational blocker recorded. Task deadline paused without misconduct penalty.', 'success');
      setBlockerModalTask(null);
      setBlockerForm({ blocker_category: 'MATERIALS', description: '', estimated_delay_hours: 1 });
      fetchOperationalData();
    } catch (err) {
      addToast(err.message || 'Failed to report blocker', 'error');
    } finally {
      setSubmittingBlocker(false);
    }
  };

  // Submit End-of-Shift Report
  const handleSubmitReport = async (e) => {
    e.preventDefault();
    if (!reportForm.property_id || !reportForm.content) {
      addToast('Please select property and enter report briefing', 'error');
      return;
    }
    setSubmittingReport(true);
    try {
      await operationsService.submitStaffReport(reportForm);
      addToast('End-of-shift operational report submitted to Property Manager!', 'success');
      setReportForm((prev) => ({ ...prev, content: '' }));
      fetchOperationalData();
    } catch (err) {
      addToast(err.message || 'Failed to submit report', 'error');
    } finally {
      setSubmittingReport(false);
    }
  };

  const activeAssignment = myAssignments[0] || null;

  const renderStatus = (val) => {
    if (!val) return '—';
    const s = String(val).toUpperCase();
    if (['ACCEPTED', 'COMPLETED', 'VERIFIED'].includes(s)) {
      return <Badge status="success">{val}</Badge>;
    }
    if (['IN_PROGRESS', 'SENT', 'DELIVERED', 'VIEWED'].includes(s)) {
      return <Badge status="pending">{val}</Badge>;
    }
    if (['REJECTED', 'BLOCKED', 'CANCELLED'].includes(s)) {
      return <Badge status="danger">{val}</Badge>;
    }
    if (['CLARIFICATION_REQUESTED'].includes(s)) {
      return <Badge status="warning">CLARIFICATION REQ.</Badge>;
    }
    return <Badge status="neutral">{val}</Badge>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ─── Sub-Tab Selector ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.5rem' }}>
        <Button
          variant={activeSubTab === 'ASSIGNMENT' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setActiveSubTab('ASSIGNMENT')}
          icon={<Building size={16} />}
        >
          My Property Assignment
        </Button>
        <Button
          variant={activeSubTab === 'TASKS' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setActiveSubTab('TASKS')}
          icon={<CheckCircle size={16} />}
        >
          My Operational Tasks ({myTasks.filter((t) => t.status !== 'COMPLETED').length})
        </Button>
        <Button
          variant={activeSubTab === 'REPORT' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setActiveSubTab('REPORT')}
          icon={<FileText size={16} />}
        >
          Submit Shift Report
        </Button>
      </div>

      {/* ─── SUB-TAB 1: MY PROPERTY ASSIGNMENT ────────────────────────────── */}
      {activeSubTab === 'ASSIGNMENT' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {!activeAssignment ? (
            <Card>
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No active property assignment on file. Check back when your Property Manager publishes your assignment.
              </div>
            </Card>
          ) : (
            <Card style={{ borderLeft: '4px solid var(--brand-accent, #ca8a04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                      {activeAssignment.property_name}
                    </h3>
                    <Badge status="available">{activeAssignment.duty_classification}</Badge>
                    {renderStatus(activeAssignment.status)}
                  </div>
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Schedule Window: <strong>{activeAssignment.start_date}</strong> to <strong>{activeAssignment.end_date}</strong> | Hours: <strong>{activeAssignment.shift_hours || '08:00 - 17:00'}</strong>
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDownloadPdf(activeAssignment.id)}
                    disabled={downloadingPdf}
                    icon={<Download size={14} />}
                  >
                    Download Notice (PDF)
                  </Button>

                  {/* Accept / Reject / Clarify buttons if not yet accepted */}
                  {['SENT', 'DELIVERED', 'VIEWED'].includes(activeAssignment.status) && (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleUpdateAssignmentStatus(activeAssignment.id, 'ACCEPTED')}
                        disabled={updatingStatus}
                        icon={<Check size={14} />}
                      >
                        Accept Assignment
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setClarificationModalId(activeAssignment.id)}
                        disabled={updatingStatus}
                        icon={<HelpCircle size={14} />}
                      >
                        Request Clarification
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setRejectModalId(activeAssignment.id)}
                        disabled={updatingStatus}
                        icon={<X size={14} />}
                        style={{ color: '#ef4444', borderColor: '#ef4444' }}
                      >
                        Decline
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {activeAssignment.special_instructions && (
                <div
                  style={{
                    padding: '0.85rem',
                    background: 'var(--bg-surface-elevated, #1a202c)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-default)',
                    fontSize: '0.88rem',
                  }}
                >
                  <strong style={{ display: 'block', color: 'var(--brand-accent, #ca8a04)', marginBottom: '0.25rem' }}>
                    Special Operational Directives:
                  </strong>
                  {activeAssignment.special_instructions}
                </div>
              )}
            </Card>
          )}

          {/* Assignment History */}
          {myAssignments.length > 1 && (
            <Card title="Assignment History">
              <Table
                columns={[
                  { header: 'Property', key: 'property_name' },
                  { header: 'Classification', key: 'duty_classification' },
                  { header: 'Dates', key: 'start_date', render: (val, row) => `${val} → ${row.end_date}` },
                  { header: 'Priority', key: 'priority' },
                  { header: 'Status', key: 'status', render: renderStatus },
                  {
                    header: 'Notice',
                    key: 'id',
                    render: (id) => (
                      <Button size="sm" variant="outline" onClick={() => handleDownloadPdf(id)} icon={<Download size={14} />}>
                        PDF
                      </Button>
                    ),
                  },
                ]}
                data={myAssignments.slice(1)}
              />
            </Card>
          )}
        </div>
      )}

      {/* ─── SUB-TAB 2: MY OPERATIONAL TICKETS & TASKS ────────────────────── */}
      {activeSubTab === 'TASKS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
              My Operational Tickets ({myTickets.length}) & Tasks ({myTasks.length})
            </h3>
            <Button variant="outline" size="sm" onClick={fetchOperationalData} icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}>
              Refresh
            </Button>
          </div>

          {myTickets.length > 0 && (
            <Card title="My Assigned & Received Tickets">
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                {[
                  { id: 'MY_TICKETS', label: 'All My Tickets' },
                  { id: 'AWAITING_ACK', label: 'Awaiting Acknowledgment' },
                  { id: 'IN_PROGRESS', label: 'In Progress' },
                  { id: 'PENDING_REVIEW', label: 'Pending Review' },
                  { id: 'COMPLETED', label: 'Completed' },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setTicketFilter(pill.id)}
                    style={{
                      padding: '0.3rem 0.65rem',
                      borderRadius: '999px',
                      fontSize: '0.74rem',
                      fontWeight: ticketFilter === pill.id ? 700 : 500,
                      border: ticketFilter === pill.id ? '1px solid #3b82f6' : '1px solid var(--border-default)',
                      background: ticketFilter === pill.id ? 'rgba(59, 130, 246, 0.18)' : 'transparent',
                      color: ticketFilter === pill.id ? '#60a5fa' : 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {myTickets
                  .filter((tk) => {
                    const st = String(tk.status || '').toUpperCase();
                    const ackDone = Boolean(tk.first_acknowledged_at || tk.my_acknowledged_at);
                    if (ticketFilter === 'AWAITING_ACK') return !ackDone && !['COMPLETED', 'CLOSED', 'CANCELLED', 'REJECTED'].includes(st);
                    if (ticketFilter === 'IN_PROGRESS') return ['IN_PROGRESS', 'ACCEPTED', 'ACKNOWLEDGED', 'AWAITING_CLARIFICATION'].includes(st);
                    if (ticketFilter === 'PENDING_REVIEW') return ['SUBMITTED_FOR_REVIEW', 'AWAITING_REVIEW'].includes(st);
                    if (ticketFilter === 'COMPLETED') return ['COMPLETED', 'CLOSED'].includes(st);
                    return true;
                  })
                  .map((tk) => {
                    const ackDeadline = tk.acknowledgment_deadline_at || tk.ack_deadline_at;
                    const ackDone = Boolean(tk.first_acknowledged_at || tk.my_acknowledged_at);
                    return (
                    <div
                      key={tk.id}
                      style={{
                        padding: '0.85rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-surface-elevated, #1a202c)',
                        border: '1px solid var(--border-default)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.75rem', color: '#60a5fa' }}>
                            {tk.ticket_reference || tk.operation_code}
                          </span>
                          <strong>{tk.title}</strong>
                          <Badge status={['CRITICAL', 'URGENT', 'HIGH'].includes(String(tk.priority).toUpperCase()) ? 'danger' : 'neutral'}>
                            {tk.priority}
                          </Badge>
                          {renderStatus(tk.status)}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          {tk.viewer_next_action?.text || tk.next_action || 'Open ticket to inspect directive and update execution.'}
                          {ackDeadline && !ackDone && (
                            <span style={{ marginLeft: '8px', color: '#fbbf24' }}>
                              · Ack SLA: {new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ackDeadline))} WAT
                            </span>
                          )}
                        </div>
                      </div>
                      <Button size="sm" variant="primary" onClick={() => setViewingOperationId(tk.id)}>
                        Open Ticket Drawer
                      </Button>
                    </div>
                  );
                  })}
              </div>
            </Card>
          )}

          <Card>
            {myTasks.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No active operational tasks assigned to you.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {myTasks.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      padding: '1rem',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-surface-elevated, #1a202c)',
                      border: t.has_active_blocker ? '1px solid #ef4444' : '1px solid var(--border-default)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '1rem' }}>{t.title}</strong>
                          <Badge status="neutral">{t.category}</Badge>
                          {t.central_operation_id && (
                            <button
                              type="button"
                              onClick={() => setViewingOperationId(t.central_operation_id)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'rgba(59, 130, 246, 0.15)',
                                border: '1px solid rgba(59, 130, 246, 0.4)',
                                borderRadius: '4px',
                                padding: '2px 8px',
                                fontSize: '0.68rem',
                                color: '#60a5fa',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                              title="Click to view full operational directive and memorandum"
                            >
                              ⚡ OPERATION DIRECTIVE {t.operation_code ? `· ${t.operation_code}` : ''}
                            </button>
                          )}
                          {renderStatus(t.status)}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          Property: <strong>{t.property_name}</strong> {t.unit_number ? `| Unit: ${t.unit_number}` : ''}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {t.central_operation_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setViewingOperationId(t.central_operation_id)}
                          >
                            Directive
                          </Button>
                        )}
                        {t.status === 'PENDING' && (
                          <Button size="sm" variant="primary" onClick={() => handleUpdateTaskProgress(t.id, 'IN_PROGRESS')}>
                            Start Task
                          </Button>
                        )}
                        {t.status === 'IN_PROGRESS' && (
                          <>
                            <Button size="sm" variant="primary" onClick={() => handleUpdateTaskProgress(t.id, 'COMPLETED')}>
                              Mark Completed
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setBlockerModalTask(t);
                                setBlockerForm({ blocker_category: 'MATERIALS', description: '', estimated_delay_hours: 1 });
                              }}
                              style={{ color: '#ef4444', borderColor: '#ef4444' }}
                            >
                              ⚠️ Report Blocker
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {t.description && (
                      <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {t.description}
                      </p>
                    )}

                    {t.has_active_blocker && (
                      <div
                        style={{
                          marginTop: '0.5rem',
                          padding: '0.5rem',
                          background: 'rgba(239, 68, 68, 0.08)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.8rem',
                          color: '#ef4444',
                        }}
                      >
                        <strong>Active Blocker: [{t.blocker_category}]</strong> {t.blocker_description}
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '0.15rem' }}>
                          Management has been notified. This task's deadline is protected from penalty.
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ─── SUB-TAB 3: SUBMIT SHIFT REPORT ──────────────────────────────── */}
      {activeSubTab === 'REPORT' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <Card title="Submit Shift Handover & Incident Report">
            <form onSubmit={handleSubmitReport} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                    Operating Property *
                  </label>
                  <input
                    type="text"
                    value={activeAssignment?.property_name || 'Assigned Property'}
                    disabled
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-elevated)',
                      color: 'var(--text-muted)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                    Shift Date *
                  </label>
                  <input
                    type="date"
                    value={reportForm.shift_date}
                    onChange={(e) => setReportForm({ ...reportForm, shift_date: e.target.value })}
                    required
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
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  End-of-Shift Briefing & Turnover Statement *
                </label>
                <textarea
                  rows={6}
                  value={reportForm.content}
                  onChange={(e) => setReportForm({ ...reportForm, content: e.target.value })}
                  required
                  placeholder="Detail completed turnovers, room readiness, guest interactions, key handovers, maintenance incidents, or pending items for the next incoming shift..."
                  style={{
                    width: '100%',
                    padding: '0.65rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    lineHeight: '1.5',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <Button variant="primary" type="submit" disabled={submittingReport} icon={<Send size={16} />}>
                  {submittingReport ? 'Submitting Report...' : 'Submit Report to Manager'}
                </Button>
              </div>
            </form>
          </Card>

          {/* Past Submitted Reports */}
          {myReports.length > 0 && (
            <Card title={`Your Past Shift Reports (${myReports.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {myReports.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: '1rem',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-surface-elevated, #1a202c)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div>
                        <strong>{r.property_name}</strong> — {r.shift_date}
                      </div>
                      {r.manager_rating ? (
                        <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.85rem' }}>
                          ★ {r.manager_rating}/5 Rated by Manager
                        </span>
                      ) : (
                        <Badge status="pending">Under Manager Review</Badge>
                      )}
                    </div>
                    <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{r.content}</div>
                    {r.manager_notes && (
                      <div
                        style={{
                          marginTop: '0.5rem',
                          padding: '0.5rem',
                          background: 'rgba(212, 175, 55, 0.08)',
                          borderLeft: '3px solid var(--brand-accent, #ca8a04)',
                          fontSize: '0.8rem',
                        }}
                      >
                        <strong>Manager Review Note:</strong> {r.manager_notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ─── MODAL: REJECT ASSIGNMENT ──────────────────────────────────────── */}
      {rejectModalId && (
        <Modal
          isOpen={Boolean(rejectModalId)}
          onClose={() => setRejectModalId(null)}
          title="Decline Property Assignment"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Declining an assignment records a formal notification to your Property Manager. Please provide your reason:
            </p>
            <textarea
              rows={4}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Schedule clash with approved medical leave or location constraint..."
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Button variant="secondary" onClick={() => setRejectModalId(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => handleUpdateAssignmentStatus(rejectModalId, 'REJECTED', { reason: rejectionReason })}
                disabled={updatingStatus}
                style={{ background: '#ef4444', borderColor: '#ef4444' }}
              >
                Confirm Decline
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── MODAL: REQUEST CLARIFICATION ──────────────────────────────────── */}
      {clarificationModalId && (
        <Modal
          isOpen={Boolean(clarificationModalId)}
          onClose={() => setClarificationModalId(null)}
          title="Request Assignment Clarification"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Submit your inquiry or clarification to your Property Manager via internal chat:
            </p>
            <textarea
              rows={4}
              value={clarificationNotes}
              onChange={(e) => setClarificationNotes(e.target.value)}
              placeholder="e.g. Please clarify shift turnover timing on Friday or VIP check-in protocol..."
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Button variant="secondary" onClick={() => setClarificationModalId(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => handleUpdateAssignmentStatus(clarificationModalId, 'CLARIFICATION_REQUESTED', { notes: clarificationNotes })}
                disabled={updatingStatus}
              >
                Submit Request
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── MODAL: REPORT BLOCKER ─────────────────────────────────────────── */}
      {blockerModalTask && (
        <Modal
          isOpen={Boolean(blockerModalTask)}
          onClose={() => setBlockerModalTask(null)}
          title={`Report Operational Blocker: ${blockerModalTask.title}`}
        >
          <form onSubmit={handleSubmitBlocker} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 'var(--radius-sm)' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                Reporting a blocker immediately alerts your Property Manager.
                <strong> Overdue tasks with active documented blockers are never counted as misconduct.</strong>
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Blocker Category *
              </label>
              <select
                value={blockerForm.blocker_category}
                onChange={(e) => setBlockerForm({ ...blockerForm, blocker_category: e.target.value })}
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
                {BLOCKER_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Blocker Description & Details *
              </label>
              <textarea
                rows={3}
                value={blockerForm.description}
                onChange={(e) => setBlockerForm({ ...blockerForm, description: e.target.value })}
                required
                placeholder="e.g. Linen storage room lock jammed or missing cleaning solvent supplies..."
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
              <Button variant="secondary" type="button" onClick={() => setBlockerModalTask(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={submittingBlocker} style={{ background: '#ef4444', borderColor: '#ef4444' }}>
                {submittingBlocker ? 'Reporting...' : 'Submit Blocker Alert'}
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
        onOperationUpdated={fetchOperationalData}
      />
    </div>
  );
}
