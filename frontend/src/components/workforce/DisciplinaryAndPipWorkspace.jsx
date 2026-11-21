import React, { useState, useEffect, useCallback } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Table from '../ui/Table';
import Modal from '../ui/Modal';
import { operationsService, employeeService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  ShieldAlert,
  Award,
  AlertTriangle,
  CheckCircle,
  Plus,
  RefreshCw,
  Send,
  Clock,
  UserCheck,
  FileText,
  Check,
  X,
} from 'lucide-react';

export default function DisciplinaryAndPipWorkspace() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const userRole = (user?.role || '').toUpperCase();
  const isOwner = userRole === 'OWNER';
  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(userRole);
  const isManager = ['OPERATIONS_MANAGER', 'MANAGER'].includes(userRole);
  const isStaff = ['RECEPTIONIST', 'STAFF'].includes(userRole);

  // STRICT GOVERNANCE CHECK: Owner is strictly barred from individual employee disciplinary records
  if (isOwner) {
    return null;
  }

  const [activeTab, setActiveTab] = useState(isStaff ? 'MY_QUERIES' : 'QUERIES'); // 'QUERIES', 'PIPS', 'MY_QUERIES'
  const [loading, setLoading] = useState(false);

  // Queries State
  const [queries, setQueries] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Issue Query Modal State (Manager/Admin)
  const [isIssueQueryOpen, setIsIssueQueryOpen] = useState(false);
  const [issuingQuery, setIssuingQuery] = useState(false);
  const [queryForm, setQueryForm] = useState({
    user_id: '',
    title: '',
    allegation: '',
    incident_date: new Date().toISOString().split('T')[0],
    response_deadline_hours: 48,
  });

  // Staff Respond to Query Modal State
  const [respondQueryTarget, setRespondQueryTarget] = useState(null);
  const [submittingResponse, setSubmittingResponse] = useState(false);
  const [responseExplanation, setResponseExplanation] = useState('');
  const [mitigatingFactors, setMitigatingFactors] = useState('');

  // Manager Conclude Query Modal State
  const [concludeTarget, setConcludeTarget] = useState(null);
  const [concluding, setConcluding] = useState(false);
  const [concludeForm, setConcludeForm] = useState({
    status: 'EXPLAINED_SATISFACTORILY', // or 'SANCTION_PENDING'
    proposed_sanction: 'WRITTEN_WARNING',
    manager_findings: '',
  });

  // Admin Sanction Review Modal State
  const [sanctionReviewTarget, setSanctionReviewTarget] = useState(null);
  const [reviewingSanction, setReviewingSanction] = useState(false);
  const [sanctionReviewForm, setSanctionReviewForm] = useState({
    approved: true,
    final_sanction: 'WRITTEN_WARNING',
    notes: '',
  });

  // PIPs State
  const [pips, setPips] = useState([]);
  const [isCreatePipOpen, setIsCreatePipOpen] = useState(false);
  const [creatingPip, setCreatingPip] = useState(false);
  const [pipForm, setPipForm] = useState({
    user_id: '',
    title: '',
    plan_type: 'PIP', // or 'RECOGNITION'
    goals_and_milestones: '',
    support_mentor_id: '',
    target_review_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Queries
      const resQueries = await operationsService.listQueries();
      setQueries(resQueries.data?.data?.queries || resQueries.data?.queries || []);

      // 2. Fetch PIPs
      const resPips = await operationsService.listPips();
      setPips(resPips.data?.data?.pips || resPips.data?.pips || []);

      // 3. Fetch Employees for dropdowns
      if (!isStaff) {
        const resEmp = await employeeService.getEmployees();
        setEmployees(resEmp.data?.employees || resEmp.data?.data || resEmp.data || []);
      }
    } catch (err) {
      console.warn('Failed to fetch disciplinary/pip data:', err.message);
    } finally {
      setLoading(false);
    }
  }, [isStaff]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Issue Query
  const handleIssueQuery = async (e) => {
    e.preventDefault();
    if (!queryForm.user_id || !queryForm.title || !queryForm.allegation) {
      addToast('Please complete all mandatory query fields', 'error');
      return;
    }
    setIssuingQuery(true);
    try {
      await operationsService.issueQuery(queryForm);
      addToast('Formal show-cause query issued and delivered via priority internal chat!', 'success');
      setIsIssueQueryOpen(false);
      setQueryForm({
        user_id: '',
        title: '',
        allegation: '',
        incident_date: new Date().toISOString().split('T')[0],
        response_deadline_hours: 48,
      });
      fetchData();
    } catch (err) {
      addToast(err.message || 'Failed to issue query', 'error');
    } finally {
      setIssuingQuery(false);
    }
  };

  // Handle Submit Staff Response
  const handleSubmitResponse = async (e) => {
    e.preventDefault();
    if (!responseExplanation) {
      addToast('Please provide your formal explanation or rebuttal statement', 'error');
      return;
    }
    setSubmittingResponse(true);
    try {
      await operationsService.submitQueryResponse(respondQueryTarget.id, {
        explanation: responseExplanation,
        mitigating_factors: mitigatingFactors,
      });
      addToast('Rebuttal statement submitted to management for formal assessment!', 'success');
      setRespondQueryTarget(null);
      setResponseExplanation('');
      setMitigatingFactors('');
      fetchData();
    } catch (err) {
      addToast(err.message || 'Failed to submit response', 'error');
    } finally {
      setSubmittingResponse(false);
    }
  };

  // Handle Conclude Query
  const handleConcludeQuery = async (e) => {
    e.preventDefault();
    setConcluding(true);
    try {
      await operationsService.concludeQuery(concludeTarget.id, concludeForm);
      addToast('Disciplinary query concluded and findings recorded!', 'success');
      setConcludeTarget(null);
      fetchData();
    } catch (err) {
      addToast(err.message || 'Failed to conclude query', 'error');
    } finally {
      setConcluding(false);
    }
  };

  // Handle Admin Sanction Review
  const handleSanctionReview = async (e) => {
    e.preventDefault();
    setReviewingSanction(true);
    try {
      await operationsService.reviewSanction(sanctionReviewTarget.id, sanctionReviewForm);
      addToast('Formal sanction review decision recorded and finalized!', 'success');
      setSanctionReviewTarget(null);
      fetchData();
    } catch (err) {
      addToast(err.message || 'Failed to review sanction', 'error');
    } finally {
      setReviewingSanction(false);
    }
  };

  // Handle Create PIP / Recognition
  const handleCreatePip = async (e) => {
    e.preventDefault();
    if (!pipForm.user_id || !pipForm.title || !pipForm.goals_and_milestones) {
      addToast('Please complete all mandatory fields', 'error');
      return;
    }
    setCreatingPip(true);
    try {
      await operationsService.createPip(pipForm);
      addToast(
        pipForm.plan_type === 'RECOGNITION'
          ? 'Positive recognition awarded and recorded!'
          : 'Performance Improvement Plan (PIP) instituted!',
        'success'
      );
      setIsCreatePipOpen(false);
      setPipForm({
        user_id: '',
        title: '',
        plan_type: 'PIP',
        goals_and_milestones: '',
        support_mentor_id: '',
        target_review_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      });
      fetchData();
    } catch (err) {
      addToast(err.message || 'Failed to create plan', 'error');
    } finally {
      setCreatingPip(false);
    }
  };

  const renderStatus = (val) => {
    if (!val) return '—';
    const s = String(val).toUpperCase();
    if (['EXPLAINED_SATISFACTORILY', 'SANCTION_REJECTED', 'CLOSED', 'COMPLETED', 'RECOGNITION'].includes(s)) {
      return <Badge status="success">{val}</Badge>;
    }
    if (['RESPONDED', 'SANCTION_APPROVED', 'ACTIVE'].includes(s)) {
      return <Badge status="pending">{val}</Badge>;
    }
    if (['PENDING_RESPONSE', 'SANCTION_PENDING'].includes(s)) {
      return <Badge status="danger">{val}</Badge>;
    }
    return <Badge status="neutral">{val}</Badge>;
  };

  // Filter staff's own queries if role is staff
  const displayQueries = isStaff
    ? queries.filter((q) => q.user_id === user?.id || q.staff_email === user?.email)
    : queries;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
      {/* ─── Tabs & Controls ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!isStaff && (
            <Button
              variant={activeTab === 'QUERIES' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('QUERIES')}
              icon={<ShieldAlert size={16} />}
            >
              Formal Disciplinary Queries ({queries.length})
            </Button>
          )}

          {isStaff && (
            <Button
              variant={activeTab === 'MY_QUERIES' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('MY_QUERIES')}
              icon={<ShieldAlert size={16} />}
            >
              My Show-Cause Notices ({displayQueries.length})
            </Button>
          )}

          <Button
            variant={activeTab === 'PIPS' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveTab('PIPS')}
            icon={<Award size={16} />}
          >
            Improvement Plans & Recognitions ({pips.length})
          </Button>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="outline" size="sm" onClick={fetchData} icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}>
            Refresh
          </Button>
          {!isStaff && activeTab === 'QUERIES' && (
            <Button variant="primary" size="sm" onClick={() => setIsIssueQueryOpen(true)} icon={<Plus size={16} />}>
              Issue Formal Query
            </Button>
          )}
          {!isStaff && activeTab === 'PIPS' && (
            <Button variant="primary" size="sm" onClick={() => setIsCreatePipOpen(true)} icon={<Plus size={16} />}>
              New PIP / Recognition
            </Button>
          )}
        </div>
      </div>

      {/* ─── TAB: QUERIES TABLE (MANAGEMENT VIEW) ─────────────────────────── */}
      {activeTab === 'QUERIES' && !isStaff && (
        <Card title={`Disciplinary Queries & Show-Cause Records (${queries.length})`}>
          {queries.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No active disciplinary queries on record. All operations compliant with standards.
            </div>
          ) : (
            <Table
              columns={[
                {
                  header: 'Staff Member',
                  key: 'staff_name',
                  render: (val, row) => (
                    <div>
                      <strong>{val || row.user_id}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.staff_email || ''}</div>
                    </div>
                  ),
                },
                {
                  header: 'Query Title & Allegation',
                  key: 'title',
                  render: (val, row) => (
                    <div>
                      <strong>{val}</strong>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '280px' }}>
                        {row.allegation}
                      </div>
                    </div>
                  ),
                },
                { header: 'Incident Date', key: 'incident_date' },
                {
                  header: 'Response Deadline',
                  key: 'deadline',
                  render: (val, row) => {
                    const dl = new Date(val);
                    const isPast = dl < new Date() && row.status === 'PENDING_RESPONSE';
                    return (
                      <span style={{ color: isPast ? '#ef4444' : 'inherit', fontWeight: isPast ? 700 : 400 }}>
                        {dl.toLocaleDateString()} {dl.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {isPast && ' (OVERDUE)'}
                      </span>
                    );
                  },
                },
                { header: 'Status', key: 'status', render: renderStatus },
                {
                  header: 'Actions',
                  key: 'id',
                  render: (id, row) => (
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {/* Manager can conclude query after staff responds */}
                      {row.status === 'RESPONDED' && isManager && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setConcludeTarget(row);
                            setConcludeForm({
                              status: 'EXPLAINED_SATISFACTORILY',
                              proposed_sanction: 'WRITTEN_WARNING',
                              manager_findings: '',
                            });
                          }}
                        >
                          Assess Rebuttal
                        </Button>
                      )}

                      {/* Admin can approve proposed formal sanction */}
                      {row.status === 'SANCTION_PENDING' && isAdmin && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            setSanctionReviewTarget(row);
                            setSanctionReviewForm({
                              approved: true,
                              final_sanction: row.proposed_sanction || 'WRITTEN_WARNING',
                              notes: '',
                            });
                          }}
                        >
                          Review Sanction
                        </Button>
                      )}

                      {row.status === 'EXPLAINED_SATISFACTORILY' && (
                        <span style={{ color: '#10b981', fontSize: '0.78rem', fontWeight: 600 }}>
                          ✓ Satisfactory
                        </span>
                      )}
                    </div>
                  ),
                },
              ]}
              data={queries}
            />
          )}
        </Card>
      )}

      {/* ─── TAB: STAFF SELF-SERVICE SHOW-CAUSE NOTICES ───────────────────── */}
      {activeTab === 'MY_QUERIES' && isStaff && (
        <Card title={`Your Show-Cause Notices (${displayQueries.length})`}>
          {displayQueries.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#10b981' }}>
              ✓ No active show-cause notices or queries on file. Your operational standing is clean.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {displayQueries.map((q) => (
                <div
                  key={q.id}
                  style={{
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface-elevated, #1a202c)',
                    border: q.status === 'PENDING_RESPONSE' ? '1px solid #ef4444' : '1px solid var(--border-default)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{q.title}</h4>
                        {renderStatus(q.status)}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Incident Date: <strong>{q.incident_date}</strong> | Issued by Management
                      </div>
                    </div>

                    {q.status === 'PENDING_RESPONSE' && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setRespondQueryTarget(q);
                          setResponseExplanation('');
                          setMitigatingFactors('');
                        }}
                        style={{ background: '#ef4444', borderColor: '#ef4444' }}
                      >
                        Submit Rebuttal Statement
                      </Button>
                    )}
                  </div>

                  <div style={{ padding: '0.75rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem' }}>
                    <strong>Allegation & Particulars:</strong>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                      {q.allegation}
                    </p>
                  </div>

                  {q.explanation && (
                    <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(59, 130, 246, 0.08)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                      <strong>Your Submitted Rebuttal:</strong>
                      <p style={{ margin: '0.25rem 0 0', color: 'var(--text-primary)' }}>{q.explanation}</p>
                    </div>
                  )}

                  {q.manager_findings && (
                    <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(212, 175, 55, 0.08)', borderLeft: '3px solid var(--brand-accent, #ca8a04)', fontSize: '0.85rem' }}>
                      <strong>Manager Assessment:</strong> {q.manager_findings}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ─── TAB: PERFORMANCE IMPROVEMENT PLANS (PIPS) & RECOGNITIONS ──────── */}
      {activeTab === 'PIPS' && (
        <Card title={`Active Plans & Positive Recognitions (${pips.length})`}>
          {pips.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No active Performance Improvement Plans or Recognitions instituted.
            </div>
          ) : (
            <Table
              columns={[
                {
                  header: 'Staff Member',
                  key: 'staff_name',
                  render: (val, row) => <strong>{val || row.user_id}</strong>,
                },
                {
                  header: 'Type',
                  key: 'plan_type',
                  render: (val) => (
                    <Badge status={val === 'RECOGNITION' ? 'success' : 'warning'}>
                      {val === 'RECOGNITION' ? '🏆 Recognition' : '📈 Improvement Plan'}
                    </Badge>
                  ),
                },
                {
                  header: 'Title & Milestones',
                  key: 'title',
                  render: (val, row) => (
                    <div>
                      <strong>{val}</strong>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '300px' }}>
                        {row.goals_and_milestones}
                      </div>
                    </div>
                  ),
                },
                { header: 'Target Review Date', key: 'target_review_date' },
                { header: 'Support Mentor', key: 'mentor_name', render: (val) => val || 'Direct Manager' },
                { header: 'Status', key: 'status', render: renderStatus },
              ]}
              data={pips}
            />
          )}
        </Card>
      )}

      {/* ─── MODAL: ISSUE FORMAL QUERY ─────────────────────────────────────── */}
      {isIssueQueryOpen && (
        <Modal
          isOpen={isIssueQueryOpen}
          onClose={() => setIsIssueQueryOpen(false)}
          title="Issue Formal Disciplinary Query"
        >
          <form onSubmit={handleIssueQuery} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Employee *
              </label>
              <select
                value={queryForm.user_id}
                onChange={(e) => setQueryForm({ ...queryForm, user_id: e.target.value })}
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
                <option value="">Select Employee...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.user_id || emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.role || emp.designation || 'Staff'})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Incident Date *
                </label>
                <input
                  type="date"
                  value={queryForm.incident_date}
                  onChange={(e) => setQueryForm({ ...queryForm, incident_date: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Response Deadline (Hours)
                </label>
                <select
                  value={queryForm.response_deadline_hours}
                  onChange={(e) => setQueryForm({ ...queryForm, response_deadline_hours: parseInt(e.target.value, 10) })}
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="24">24 Hours (Urgent)</option>
                  <option value="48">48 Hours (Standard)</option>
                  <option value="72">72 Hours (Extended)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Query Title *
              </label>
              <input
                type="text"
                value={queryForm.title}
                onChange={(e) => setQueryForm({ ...queryForm, title: e.target.value })}
                required
                placeholder="e.g. Unexplained Absence from Front Desk & Missed VIP Arrival"
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

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Allegations & Evidence Particulars *
              </label>
              <textarea
                rows={4}
                value={queryForm.allegation}
                onChange={(e) => setQueryForm({ ...queryForm, allegation: e.target.value })}
                required
                placeholder="Describe specific infractions, timestamps, property location, and operational impacts..."
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
              <Button variant="secondary" type="button" onClick={() => setIsIssueQueryOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={issuingQuery} style={{ background: '#ef4444', borderColor: '#ef4444' }}>
                {issuingQuery ? 'Issuing...' : 'Issue Formal Query'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── MODAL: STAFF SUBMIT REBUTTAL ─────────────────────────────────── */}
      {respondQueryTarget && (
        <Modal
          isOpen={Boolean(respondQueryTarget)}
          onClose={() => setRespondQueryTarget(null)}
          title={`Show-Cause Explanation: ${respondQueryTarget.title}`}
        >
          <form onSubmit={handleSubmitResponse} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: '#ef4444' }}>Allegation:</strong>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                {respondQueryTarget.allegation}
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Your Formal Explanation / Rebuttal *
              </label>
              <textarea
                rows={5}
                value={responseExplanation}
                onChange={(e) => setResponseExplanation(e.target.value)}
                required
                placeholder="Provide factual details, logs, or events surrounding the incident..."
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

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Mitigating Circumstances (Optional)
              </label>
              <textarea
                rows={2}
                value={mitigatingFactors}
                onChange={(e) => setMitigatingFactors(e.target.value)}
                placeholder="e.g. Documented utility failure or urgent emergency tenant assistance..."
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
              <Button variant="secondary" type="button" onClick={() => setRespondQueryTarget(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={submittingResponse}>
                {submittingResponse ? 'Submitting...' : 'Submit Rebuttal'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── MODAL: MANAGER CONCLUDE QUERY ─────────────────────────────────── */}
      {concludeTarget && (
        <Modal
          isOpen={Boolean(concludeTarget)}
          onClose={() => setConcludeTarget(null)}
          title={`Manager Assessment: ${concludeTarget.title}`}
        >
          <form onSubmit={handleConcludeQuery} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)' }}>
              <strong>Staff Explanation:</strong>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {concludeTarget.explanation}
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Assessment Outcome *
              </label>
              <select
                value={concludeForm.status}
                onChange={(e) => setConcludeForm({ ...concludeForm, status: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="EXPLAINED_SATISFACTORILY">Explained Satisfactorily (No Penalty)</option>
                <option value="SANCTION_PENDING">Unsatisfactory - Escalate for Formal Sanction</option>
              </select>
            </div>

            {concludeForm.status === 'SANCTION_PENDING' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Proposed Sanction
                </label>
                <select
                  value={concludeForm.proposed_sanction}
                  onChange={(e) => setConcludeForm({ ...concludeForm, proposed_sanction: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="WRITTEN_WARNING">Formal Written Warning</option>
                  <option value="FINAL_WARNING">Final Written Warning</option>
                  <option value="SUSPENSION">Operational Suspension</option>
                  <option value="TERMINATION">Termination Recommendation</option>
                </select>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Manager Evaluation Findings *
              </label>
              <textarea
                rows={3}
                value={concludeForm.manager_findings}
                onChange={(e) => setConcludeForm({ ...concludeForm, manager_findings: e.target.value })}
                required
                placeholder="State basis for accepting rebuttal or recommending sanction..."
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
              <Button variant="secondary" type="button" onClick={() => setConcludeTarget(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={concluding}>
                {concluding ? 'Saving...' : 'Record Findings'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── MODAL: ADMIN SANCTION REVIEW ─────────────────────────────────── */}
      {sanctionReviewTarget && (
        <Modal
          isOpen={Boolean(sanctionReviewTarget)}
          onClose={() => setSanctionReviewTarget(null)}
          title={`Admin Sanction Review: ${sanctionReviewTarget.staff_name}`}
        >
          <form onSubmit={handleSanctionReview} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 'var(--radius-sm)' }}>
              <strong>Proposed Sanction:</strong> {sanctionReviewTarget.proposed_sanction}
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                Manager Findings: {sanctionReviewTarget.manager_findings}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Administrative Decision
              </label>
              <select
                value={sanctionReviewForm.approved ? 'APPROVE' : 'REJECT'}
                onChange={(e) => setSanctionReviewForm({ ...sanctionReviewForm, approved: e.target.value === 'APPROVE' })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="APPROVE">Approve Formal Sanction</option>
                <option value="REJECT">Reject / Dismiss Sanction</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Executive Justification & Notes *
              </label>
              <textarea
                rows={3}
                value={sanctionReviewForm.notes}
                onChange={(e) => setSanctionReviewForm({ ...sanctionReviewForm, notes: e.target.value })}
                required
                placeholder="Record administrative justification for sanction decision..."
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
              <Button variant="secondary" type="button" onClick={() => setSanctionReviewTarget(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={reviewingSanction}>
                {reviewingSanction ? 'Saving...' : 'Finalize Decision'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── MODAL: CREATE PIP OR RECOGNITION ──────────────────────────────── */}
      {isCreatePipOpen && (
        <Modal
          isOpen={isCreatePipOpen}
          onClose={() => setIsCreatePipOpen(false)}
          title="Institute Performance Plan / Award Recognition"
        >
          <form onSubmit={handleCreatePip} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Action Type *
                </label>
                <select
                  value={pipForm.plan_type}
                  onChange={(e) => setPipForm({ ...pipForm, plan_type: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="PIP">📈 Performance Improvement Plan (PIP)</option>
                  <option value="RECOGNITION">🏆 Positive Recognition / Commendation</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Employee *
                </label>
                <select
                  value={pipForm.user_id}
                  onChange={(e) => setPipForm({ ...pipForm, user_id: e.target.value })}
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
                  <option value="">Select Employee...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.user_id || emp.id}>
                      {emp.first_name} {emp.last_name} ({emp.role || emp.designation || 'Staff'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Title *
              </label>
              <input
                type="text"
                value={pipForm.title}
                onChange={(e) => setPipForm({ ...pipForm, title: e.target.value })}
                required
                placeholder={
                  pipForm.plan_type === 'RECOGNITION'
                    ? 'e.g. Star Receptionist - Zero Claim Latency Award'
                    : 'e.g. 30-Day Punctuality & Readiness Improvement Plan'
                }
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

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                {pipForm.plan_type === 'RECOGNITION' ? 'Commendation Citation & Impact *' : 'Specific Milestones & Goals *'}
              </label>
              <textarea
                rows={4}
                value={pipForm.goals_and_milestones}
                onChange={(e) => setPipForm({ ...pipForm, goals_and_milestones: e.target.value })}
                required
                placeholder={
                  pipForm.plan_type === 'RECOGNITION'
                    ? 'State outstanding contributions, tenant praises, or metrics achieved...'
                    : 'Detail specific targets, weekly check-ins, and performance standards required...'
                }
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
                  Target Review Date
                </label>
                <input
                  type="date"
                  value={pipForm.target_review_date}
                  onChange={(e) => setPipForm({ ...pipForm, target_review_date: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Assigned Support Mentor (Optional)
                </label>
                <select
                  value={pipForm.support_mentor_id}
                  onChange={(e) => setPipForm({ ...pipForm, support_mentor_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="">Direct Manager</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.user_id || emp.id}>
                      {emp.first_name} {emp.last_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="secondary" type="button" onClick={() => setIsCreatePipOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={creatingPip}>
                {creatingPip ? 'Saving...' : 'Institute Plan / Award'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
