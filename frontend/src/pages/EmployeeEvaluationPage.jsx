import React, { useState, useEffect, useMemo } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Table from '../components/ui/Table';
import Modal, { ConfirmationModal } from '../components/ui/Modal';
import { employeeService, propertyService } from '../services/api';
import { useProperty } from '../context/PropertyContext';
import { useToast } from '../context/ToastContext';

export default function EmployeeEvaluationPage() {
  const { properties, activePropertyId } = useProperty();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Data
  const [evaluations, setEvaluations] = useState([]);
  const [criteria, setCriteria] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Filters
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || 'all');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isEvaluationModalOpen, setIsEvaluationModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedEvaluation, setSelectedEvaluation] = useState(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // Form State
  const initialForm = {
    employeeId: '',
    periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    periodEnd: new Date().toISOString().slice(0, 10),
    evaluationPeriodLabel: '',
    strengths: '',
    areasForImprovement: '',
    evaluatorComments: '',
    scores: {},
  };
  const [form, setForm] = useState(initialForm);

  // Sync propertyFilter
  useEffect(() => {
    setPropertyFilter(activePropertyId || 'all');
  }, [activePropertyId]);

  // Load criteria, employees, evaluations
  const fetchData = async () => {
    setLoading(true);
    try {
      const propParam = propertyFilter !== 'all' ? propertyFilter : undefined;
      const [evalRes, critRes, empRes] = await Promise.all([
        employeeService.getEvaluations({
          propertyId: propParam,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          limit: 100,
        }),
        employeeService.getEvaluationCriteria(),
        employeeService.getAll({ propertyId: propParam, status: 'ACTIVE', limit: 100 }),
      ]);

      setEvaluations(evalRes.data?.data || evalRes.data || []);
      const loadedCriteria = critRes.data?.data || critRes.data || [];
      setCriteria(loadedCriteria);
      setEmployees(empRes.data?.data || empRes.data || []);
    } catch (err) {
      addToast(`Failed to load evaluations: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [propertyFilter, statusFilter]);

  // Open Create
  const handleOpenCreate = () => {
    setIsEditMode(false);
    setSelectedEvaluation(null);

    // Initial scores with 80 default
    const defaultScores = {};
    criteria.forEach((c) => {
      defaultScores[c.id] = { score: 80, comments: '' };
    });

    const now = new Date();
    const periodLabel = `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()} Review`;

    setForm({
      ...initialForm,
      evaluationPeriodLabel: periodLabel,
      scores: defaultScores,
    });
    setIsEvaluationModalOpen(true);
  };

  // Open Edit
  const handleOpenEdit = (evaluation) => {
    setIsEditMode(true);
    setSelectedEvaluation(evaluation);

    const mappedScores = {};
    if (evaluation.scores && Array.isArray(evaluation.scores)) {
      evaluation.scores.forEach((s) => {
        mappedScores[s.criterion_id] = { score: parseFloat(s.score), comments: s.comments || '' };
      });
    } else {
      criteria.forEach((c) => {
        mappedScores[c.id] = { score: 80, comments: '' };
      });
    }

    setForm({
      employeeId: evaluation.employee_id,
      periodStart: evaluation.period_start?.slice(0, 10),
      periodEnd: evaluation.period_end?.slice(0, 10),
      evaluationPeriodLabel: evaluation.evaluation_period_label,
      strengths: evaluation.strengths || '',
      areasForImprovement: evaluation.areas_for_improvement || '',
      evaluatorComments: evaluation.evaluator_comments || '',
      scores: mappedScores,
    });
    setIsEvaluationModalOpen(true);
  };

  // Open Details Modal
  const handleOpenDetails = async (evaluation) => {
    try {
      const res = await employeeService.getEvaluations({ id: evaluation.id });
      // Or by ID
      const single = await employeeService.getEvaluationCriteria(); // fallback
      setSelectedEvaluation(evaluation);
      setIsDetailsModalOpen(true);
    } catch {
      setSelectedEvaluation(evaluation);
      setIsDetailsModalOpen(true);
    }
  };

  // Computed Average Score
  const currentAverageScore = useMemo(() => {
    const scoreVals = Object.values(form.scores || {}).map((s) => parseFloat(s.score) || 0);
    if (scoreVals.length === 0) return 0;
    const sum = scoreVals.reduce((acc, v) => acc + v, 0);
    return Number((sum / scoreVals.length).toFixed(1));
  }, [form.scores]);

  // Handle Save (Draft)
  const handleSaveDraft = async (e) => {
    e?.preventDefault();
    setActionLoading(true);
    try {
      const formattedScores = Object.entries(form.scores).map(([criterionId, data]) => ({
        criterion_id: parseInt(criterionId, 10),
        score: parseFloat(data.score) || 0,
        comments: data.comments,
      }));

      const payload = {
        employeeId: parseInt(form.employeeId, 10),
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        evaluationPeriodLabel: form.evaluationPeriodLabel,
        strengths: form.strengths,
        areasForImprovement: form.areasForImprovement,
        evaluatorComments: form.evaluatorComments,
        scores: formattedScores,
      };

      if (isEditMode && selectedEvaluation) {
        await employeeService.updateEvaluation(selectedEvaluation.id, payload);
        addToast('Evaluation draft updated successfully.', 'success');
      } else {
        await employeeService.createEvaluation(payload);
        addToast('Evaluation draft created successfully.', 'success');
      }

      setIsEvaluationModalOpen(false);
      fetchData();
    } catch (err) {
      addToast(`Save failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Evaluation (DRAFT -> SUBMITTED)
  const handleSubmitEvaluation = async (evaluation) => {
    setActionLoading(true);
    try {
      await employeeService.submitEvaluation(evaluation.id);
      addToast(`Evaluation #${evaluation.evaluation_code} submitted for final sign-off.`, 'success');
      fetchData();
    } catch (err) {
      addToast(`Submit failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Finalize Evaluation (SUBMITTED / DRAFT -> FINALIZED)
  const handleFinalizeEvaluation = async (evaluation) => {
    setActionLoading(true);
    try {
      await employeeService.finalizeEvaluation(evaluation.id);
      addToast(`Evaluation #${evaluation.evaluation_code} officially finalized.`, 'success');
      fetchData();
    } catch (err) {
      addToast(`Finalize failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Status Badge Helper
  const getStatusBadge = (status) => {
    switch (status) {
      case 'FINALIZED':
        return <Badge status="success">FINALIZED</Badge>;
      case 'SUBMITTED':
        return <Badge status="info">SUBMITTED</Badge>;
      case 'DRAFT':
        return <Badge status="pending">DRAFT</Badge>;
      default:
        return <Badge status="neutral">{status}</Badge>;
    }
  };

  // Filtered evaluations
  const filteredEvaluations = useMemo(() => {
    if (!searchQuery.trim()) return evaluations;
    const q = searchQuery.toLowerCase();
    return evaluations.filter(
      (ev) =>
        ev.employee_name?.toLowerCase().includes(q) ||
        ev.employee_code?.toLowerCase().includes(q) ||
        ev.evaluation_code?.toLowerCase().includes(q) ||
        ev.evaluation_period_label?.toLowerCase().includes(q)
    );
  }, [evaluations, searchQuery]);

  return (
    <div>
      {/* Header */}
      <div
        className="page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span>Performance Evaluations</span>
            <Badge status="info">PHASE 11 ENGINE</Badge>
          </h1>
          <p className="page-subtitle">
            Manager evaluation workflows, 9-dimension scoring criteria, evidence-based system metrics, and audit history.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => setStatusFilter(statusFilter === 'FINALIZED' ? 'ALL' : 'FINALIZED')}>
            {statusFilter === 'FINALIZED' ? 'Show All Reviews' : 'Show Finalized Only'}
          </Button>
          <Button variant="primary" onClick={handleOpenCreate}>
            + Start Evaluation
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Total Evaluations
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {evaluations.length}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Across all personnel
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Finalized Reviews
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
            {evaluations.filter((e) => e.status === 'FINALIZED').length}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Official historical records
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Pending Sign-Off
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f59e0b', marginTop: '0.25rem' }}>
            {evaluations.filter((e) => e.status === 'SUBMITTED').length}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Submitted drafts awaiting finalization
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Draft Evaluations
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#38bdf8', marginTop: '0.25rem' }}>
            {evaluations.filter((e) => e.status === 'DRAFT').length}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Work-in-progress drafts
          </div>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1, minWidth: '240px' }}>
            <input
              type="text"
              placeholder="Search evaluation code, staff name, period..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                maxWidth: '360px',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="all">All Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="FINALIZED">Finalized</option>
            </select>

            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              🔄 Refresh
            </Button>
          </div>
        </div>
      </Card>

      {/* Evaluations Table */}
      <Card title={`Performance Evaluation Reviews (${filteredEvaluations.length})`}>
        {loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading performance evaluations...
          </div>
        ) : filteredEvaluations.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No evaluation records match the active criteria.
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Employee / Staff</th>
                <th>Department</th>
                <th>Evaluation Period</th>
                <th>Overall Score</th>
                <th>Status</th>
                <th>Evaluator</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvaluations.map((ev) => (
                <tr key={ev.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--brand-accent)' }}>
                    {ev.evaluation_code}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ev.employee_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ev.employee_code}</div>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.8rem' }}>{ev.department?.replace('_', ' ')}</span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{ev.evaluation_period_label}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {ev.period_start?.slice(0, 10)} → {ev.period_end?.slice(0, 10)}
                    </div>
                  </td>
                  <td>
                    {ev.manager_overall_score !== null ? (
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '1rem',
                          color: parseFloat(ev.manager_overall_score) >= 80 ? '#10b981' : '#f59e0b',
                        }}
                      >
                        {ev.manager_overall_score}%
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Pending</span>
                    )}
                  </td>
                  <td>{getStatusBadge(ev.status)}</td>
                  <td style={{ fontSize: '0.82rem' }}>{ev.evaluator_name}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                      {ev.status === 'DRAFT' && (
                        <>
                          <Button variant="outline" size="small" onClick={() => handleOpenEdit(ev)} disabled={actionLoading}>
                            Edit
                          </Button>
                          <Button variant="primary" size="small" onClick={() => handleSubmitEvaluation(ev)} disabled={actionLoading}>
                            Submit
                          </Button>
                        </>
                      )}
                      {ev.status === 'SUBMITTED' && (
                        <Button variant="primary" size="small" onClick={() => handleFinalizeEvaluation(ev)} disabled={actionLoading}>
                          Finalize
                        </Button>
                      )}
                      <Button variant="secondary" size="small" onClick={() => handleOpenDetails(ev)}>
                        View
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* MODAL: CREATE / EDIT EVALUATION */}
      <Modal
        isOpen={isEvaluationModalOpen}
        onClose={() => setIsEvaluationModalOpen(false)}
        title={isEditMode ? `Edit Evaluation: ${selectedEvaluation?.evaluation_code}` : 'Conduct Manager Evaluation'}
        size="lg"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ fontSize: '0.9rem' }}>
              Computed Score: <strong style={{ color: 'var(--brand-accent)', fontSize: '1.1rem' }}>{currentAverageScore}%</strong>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Button variant="secondary" onClick={() => setIsEvaluationModalOpen(false)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveDraft} disabled={actionLoading}>
                {actionLoading ? 'Saving...' : isEditMode ? 'Update Evaluation' : 'Save Draft Evaluation'}
              </Button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleSaveDraft} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Employee & Period Setup */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Select Employee *
              </label>
              <select
                required
                disabled={isEditMode}
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="">Select Employee...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.employee_code} - {emp.job_title})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Evaluation Period Label *
              </label>
              <input
                type="text"
                required
                value={form.evaluationPeriodLabel}
                onChange={(e) => setForm({ ...form, evaluationPeriodLabel: e.target.value })}
                placeholder="e.g. Q3 2026 Performance Review"
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Period Start Date *
              </label>
              <input
                type="date"
                required
                value={form.periodStart}
                onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Period End Date *
              </label>
              <input
                type="date"
                required
                value={form.periodEnd}
                onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          {/* 9 Dimensions Criteria Scoring Section */}
          <div
            style={{
              padding: '0.5rem 0.75rem',
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '0.82rem',
              color: 'var(--brand-accent, #ca8a04)',
            }}
          >
            📊 9-Dimension Manager Assessment Scoring (0 - 100%)
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {criteria.map((c) => {
              const currentScore = form.scores[c.id]?.score ?? 80;
              return (
                <div
                  key={c.id}
                  style={{
                    padding: '0.75rem',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <div>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{c.name}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                        ({c.description})
                      </span>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: currentScore >= 80 ? '#10b981' : '#f59e0b' }}>
                      {currentScore}%
                    </span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={currentScore}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setForm({
                        ...form,
                        scores: {
                          ...form.scores,
                          [c.id]: {
                            ...form.scores[c.id],
                            score: val,
                          },
                        },
                      });
                    }}
                    style={{ width: '100%', accentColor: 'var(--brand-accent)' }}
                  />
                </div>
              );
            })}
          </div>

          {/* Comments & Feedback */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Core Strengths Observed
            </label>
            <textarea
              rows="2"
              value={form.strengths}
              onChange={(e) => setForm({ ...form, strengths: e.target.value })}
              placeholder="Highlight notable achievements, punctuality, excellence..."
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Areas for Improvement
            </label>
            <textarea
              rows="2"
              value={form.areasForImprovement}
              onChange={(e) => setForm({ ...form, areasForImprovement: e.target.value })}
              placeholder="Growth goals, training needs, speed or communication refinements..."
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Evaluator Summary Comments
            </label>
            <textarea
              rows="2"
              value={form.evaluatorComments}
              onChange={(e) => setForm({ ...form, evaluatorComments: e.target.value })}
              placeholder="Overall feedback for official HR performance record..."
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </form>
      </Modal>

      {/* MODAL: VIEW EVALUATION DETAILS */}
      <Modal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        title={selectedEvaluation ? `Evaluation Review: ${selectedEvaluation.evaluation_code}` : 'Evaluation Details'}
        size="lg"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setIsDetailsModalOpen(false)}>
              Close
            </Button>
          </div>
        }
      >
        {selectedEvaluation && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Header pill strip */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>EMPLOYEE</div>
                <strong style={{ fontSize: '1.1rem' }}>{selectedEvaluation.employee_name}</strong>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PERIOD</div>
                <strong>{selectedEvaluation.evaluation_period_label}</strong>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>OVERALL SCORE</div>
                <strong style={{ fontSize: '1.3rem', color: parseFloat(selectedEvaluation.manager_overall_score || 0) >= 80 ? '#10b981' : '#f59e0b' }}>
                  {selectedEvaluation.manager_overall_score}%
                </strong>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>STATUS</div>
                {getStatusBadge(selectedEvaluation.status)}
              </div>
            </div>

            {/* Strengths and Improvements */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ padding: '0.75rem', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
                <h4 style={{ fontSize: '0.85rem', color: '#10b981', margin: '0 0 0.5rem' }}>Core Strengths</h4>
                <p style={{ fontSize: '0.82rem', margin: 0 }}>{selectedEvaluation.strengths || 'None recorded.'}</p>
              </div>

              <div style={{ padding: '0.75rem', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
                <h4 style={{ fontSize: '0.85rem', color: '#f59e0b', margin: '0 0 0.5rem' }}>Areas for Improvement</h4>
                <p style={{ fontSize: '0.82rem', margin: 0 }}>{selectedEvaluation.areas_for_improvement || 'None recorded.'}</p>
              </div>
            </div>

            {selectedEvaluation.evaluator_comments && (
              <div style={{ padding: '0.75rem', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: '0 0 0.5rem' }}>Evaluator Comments</h4>
                <p style={{ fontSize: '0.82rem', margin: 0 }}>{selectedEvaluation.evaluator_comments}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
