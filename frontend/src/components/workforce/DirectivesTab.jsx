import React, { useState, useEffect, useCallback } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Table from '../ui/Table';
import Modal from '../ui/Modal';
import { operationsService, employeeService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useProperty } from '../../context/PropertyContext';
import { useToast } from '../../context/ToastContext';
import {
  ShieldCheck,
  Plus,
  Send,
  Calendar,
  Clock,
  AlertCircle,
  RefreshCw,
  FileText,
  UserCheck,
} from 'lucide-react';

export default function DirectivesTab({ activePropertyId }) {
  const { user } = useAuth();
  const { properties } = useProperty();
  const { addToast } = useToast();

  const userRole = (user?.role || '').toUpperCase();
  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(userRole);
  const isManager = ['OPERATIONS_MANAGER', 'MANAGER'].includes(userRole);

  const [directives, setDirectives] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Admin Create Directive Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createForm, setCreateForm] = useState({
    property_id: activePropertyId !== 'all' ? activePropertyId : '',
    title: '',
    description: '',
    priority: 'IMPORTANT',
    assigned_manager_id: '',
    deadline: '',
  });

  // Manager Submit Plan Modal
  const [planModalDirective, setPlanModalDirective] = useState(null);
  const [planSaving, setPlanSaving] = useState(false);
  const [planForm, setPlanForm] = useState({
    execution_plan: '',
    estimated_completion_date: '',
  });

  const fetchDirectives = useCallback(async () => {
    setLoading(true);
    try {
      const res = await operationsService.listDirectives();
      setDirectives(res.data?.data?.directives || res.data?.directives || []);
    } catch (err) {
      addToast(err.message || 'Failed to load directives', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  const fetchManagers = useCallback(async () => {
    try {
      const res = await employeeService.getEmployees();
      const list = res.data?.employees || res.data?.data || res.data || [];
      const mgrList = list.filter((e) => ['ADMIN', 'MANAGER', 'OPERATIONS_MANAGER'].includes((e.role || '').toUpperCase()));
      setManagers(mgrList);
    } catch (err) {
      console.warn('Failed to load managers:', err.message);
    }
  }, []);

  useEffect(() => {
    fetchDirectives();
    fetchManagers();
  }, [fetchDirectives, fetchManagers]);

  const handleCreateDirective = async (e) => {
    e.preventDefault();
    if (!createForm.title || !createForm.description) {
      addToast('Please enter directive title and description', 'error');
      return;
    }
    setCreateSaving(true);
    try {
      await operationsService.createDirective(createForm);
      addToast('Administrative directive issued and manager notified via priority chat!', 'success');
      setIsCreateOpen(false);
      setCreateForm({
        property_id: activePropertyId !== 'all' ? activePropertyId : '',
        title: '',
        description: '',
        priority: 'IMPORTANT',
        assigned_manager_id: '',
        deadline: '',
      });
      fetchDirectives();
    } catch (err) {
      addToast(err.message || 'Failed to issue directive', 'error');
    } finally {
      setCreateSaving(false);
    }
  };

  const handleSubmitPlan = async (e) => {
    e.preventDefault();
    if (!planForm.execution_plan) {
      addToast('Please describe your operational execution plan', 'error');
      return;
    }
    setPlanSaving(true);
    try {
      await operationsService.submitDirectivePlan(planModalDirective.id, planForm);
      addToast('Execution plan submitted to Administration!', 'success');
      setPlanModalDirective(null);
      setPlanForm({ execution_plan: '', estimated_completion_date: '' });
      fetchDirectives();
    } catch (err) {
      addToast(err.message || 'Failed to submit execution plan', 'error');
    } finally {
      setPlanSaving(false);
    }
  };

  const renderStatus = (val) => {
    if (!val) return '—';
    const s = String(val).toUpperCase();
    if (['FULFILLED', 'COMPLETED'].includes(s)) {
      return <Badge status="success">{val}</Badge>;
    }
    if (['PLAN_SUBMITTED', 'IN_PROGRESS', 'ISSUED'].includes(s)) {
      return <Badge status="pending">{val}</Badge>;
    }
    if (['CANCELLED', 'OVERDUE'].includes(s)) {
      return <Badge status="danger">{val}</Badge>;
    }
    return <Badge status="neutral">{val}</Badge>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={20} style={{ color: 'var(--brand-accent, #ca8a04)' }} />
            <span>Operational Directives & Manager Execution Plans</span>
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
            Top-down administrative mandates, goal tracking, target outcomes, and operational execution plans submitted by Property Managers.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="outline" size="sm" onClick={fetchDirectives} icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}>
            Refresh
          </Button>
          {isAdmin && (
            <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)} icon={<Plus size={16} />}>
              Issue Directive
            </Button>
          )}
        </div>
      </div>

      <Card>
        {loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading directives...
          </div>
        ) : directives.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No operational directives issued.
          </div>
        ) : (
          <Table
            columns={[
              {
                header: 'Directive Title',
                key: 'title',
                render: (val, row) => (
                  <div>
                    <strong>{val}</strong>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '300px' }}>
                      {row.description}
                    </div>
                  </div>
                ),
              },
              { header: 'Property', key: 'property_name', render: (val) => val || 'Company-Wide' },
              { header: 'Assigned Manager', key: 'assigned_manager_name', render: (val) => val || 'All Managers' },
              {
                header: 'Priority',
                key: 'priority',
                render: (val) => (
                  <Badge status={val === 'URGENT' ? 'danger' : val === 'IMPORTANT' ? 'warning' : 'neutral'}>
                    {val}
                  </Badge>
                ),
              },
              {
                header: 'Deadline',
                key: 'deadline',
                render: (val) => (val ? new Date(val).toLocaleDateString() : 'Immediate'),
              },
              { header: 'Status', key: 'status', render: renderStatus },
              {
                header: 'Execution Plan',
                key: 'id',
                render: (id, row) => {
                  if (row.execution_plan) {
                    return (
                      <div style={{ fontSize: '0.78rem', color: '#10b981', maxWidth: '200px' }}>
                        ✓ {row.execution_plan.substring(0, 50)}...
                      </div>
                    );
                  }
                  if (isManager && row.status === 'ISSUED') {
                    return (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setPlanModalDirective(row);
                          setPlanForm({ execution_plan: '', estimated_completion_date: '' });
                        }}
                      >
                        Submit Plan
                      </Button>
                    );
                  }
                  return <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Pending Plan</span>;
                },
              },
            ]}
            data={directives}
          />
        )}
      </Card>

      {/* ─── MODAL: ISSUE DIRECTIVE ────────────────────────────────────────── */}
      {isCreateOpen && (
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Issue Administrative Directive"
        >
          <form onSubmit={handleCreateDirective} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Directive Title *
              </label>
              <input
                type="text"
                value={createForm.title}
                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                required
                placeholder="e.g. Complete Deep-Cleaning & Readiness Audit at Ikoyi Heights"
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
                  Property (Optional)
                </label>
                <select
                  value={createForm.property_id}
                  onChange={(e) => setCreateForm({ ...createForm, property_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="">Company-Wide / All Properties</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Assigned Manager (Optional)
                </label>
                <select
                  value={createForm.assigned_manager_id}
                  onChange={(e) => setCreateForm({ ...createForm, assigned_manager_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="">All Operational Managers</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.user_id || m.id}>
                      {m.first_name} {m.last_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Priority Level
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
                  <option value="URGENT">Urgent (Requires Immediate Plan)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Execution Deadline
                </label>
                <input
                  type="date"
                  value={createForm.deadline}
                  onChange={(e) => setCreateForm({ ...createForm, deadline: e.target.value })}
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
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Mandate Details & Target Outcomes *
              </label>
              <textarea
                rows={4}
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                required
                placeholder="Specify precise goals, key deliverables, and standards required..."
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
              <Button variant="primary" type="submit" disabled={createSaving}>
                {createSaving ? 'Issuing...' : 'Issue Directive & Notify Managers'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── MODAL: SUBMIT EXECUTION PLAN ─────────────────────────────────── */}
      {planModalDirective && (
        <Modal
          isOpen={Boolean(planModalDirective)}
          onClose={() => setPlanModalDirective(null)}
          title={`Submit Execution Plan: ${planModalDirective.title}`}
        >
          <form onSubmit={handleSubmitPlan} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', background: 'rgba(212, 175, 55, 0.08)', borderRadius: 'var(--radius-sm)' }}>
              <strong>Directive Mandate:</strong>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {planModalDirective.description}
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Manager Operational Execution Plan *
              </label>
              <textarea
                rows={5}
                value={planForm.execution_plan}
                onChange={(e) => setPlanForm({ ...planForm, execution_plan: e.target.value })}
                required
                placeholder="Detail staff allocation, operational phases, material readiness, and execution schedule..."
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
                Estimated Completion Date
              </label>
              <input
                type="date"
                value={planForm.estimated_completion_date}
                onChange={(e) => setPlanForm({ ...planForm, estimated_completion_date: e.target.value })}
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="secondary" type="button" onClick={() => setPlanModalDirective(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={planSaving}>
                {planSaving ? 'Submitting Plan...' : 'Submit Execution Plan'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
