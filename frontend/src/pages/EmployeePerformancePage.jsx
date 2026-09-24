import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useProperty } from '../context/PropertyContext';
import { employeeService } from '../services/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import {
  Award,
  TrendingUp,
  Activity,
  CheckCircle,
  Calendar,
  User,
  Filter,
  BarChart2,
  AlertCircle,
  Search,
  ArrowUpRight,
  ShieldAlert,
  CreditCard,
} from '../components/ui/Icons';

export default function EmployeePerformancePage() {
  const { id: routeEmpId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentProperty } = useProperty();

  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(routeEmpId ? parseInt(routeEmpId, 10) : null);
  const [performanceData, setPerformanceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters for employee selection
  const [searchQuery, setSearchQuery] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  // Fetch employee list for selector
  const fetchEmployees = useCallback(async () => {
    try {
      const params = {};
      if (currentProperty?.id) {
        params.property_id = currentProperty.id;
      }
      const res = await employeeService.getEmployees(params);
      const list = res.data?.employees || res.data?.data || res.data || [];
      setEmployees(list);

      if (list.length > 0) {
        if (routeEmpId) {
          const matched = list.find((e) => e.id === parseInt(routeEmpId, 10));
          if (matched) setSelectedEmployeeId(matched.id);
          else setSelectedEmployeeId(list[0].id);
        } else if (!selectedEmployeeId) {
          setSelectedEmployeeId(list[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load employee directory for performance:', err);
    }
  }, [currentProperty, routeEmpId, selectedEmployeeId]);

  // Fetch performance for selected employee
  const fetchPerformance = useCallback(async (empId) => {
    if (!empId) return;
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (periodStart) params.period_start = periodStart;
      if (periodEnd) params.period_end = periodEnd;
      const res = await employeeService.getEmployeePerformance(empId, params);
      setPerformanceData(res.data?.data || res.data);
    } catch (err) {
      console.error('Failed to fetch employee performance data:', err);
      setError(err.response?.data?.error?.message || err.message || 'Failed to retrieve performance metrics.');
      setPerformanceData(null);
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    if (selectedEmployeeId) {
      fetchPerformance(selectedEmployeeId);
    }
  }, [selectedEmployeeId, fetchPerformance]);

  const filteredEmployees = employees.filter((emp) => {
    const q = searchQuery.toLowerCase();
    const name = `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase();
    const code = (emp.staff_code || emp.employee_code || '').toLowerCase();
    const title = (emp.job_title || '').toLowerCase();
    const dept = (emp.department || '').toLowerCase();
    return name.includes(q) || code.includes(q) || title.includes(q) || dept.includes(q);
  });

  const selectedEmp = employees.find((e) => e.id === selectedEmployeeId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header */}
      <div
        className="page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span>Operations & Performance Analytics</span>
            <Badge status="info">AUDIT VERIFIED</Badge>
          </h1>
          <p className="page-subtitle">
            System-logged operational metrics juxtaposed against formal supervisor evaluations and performance criteria.
          </p>
        </div>
        {selectedEmployeeId && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/app/employees/${selectedEmployeeId}`)}
            >
              Staff Profile
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/app/employees/${selectedEmployeeId}/id-card`)}
            >
              ID Badge
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate(`/app/evaluations`)}
            >
              Evaluations Hub
            </Button>
          </div>
        )}
      </div>

      {/* Main Grid: Left selector, Right performance dashboards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 320px) 1fr',
          gap: '1.5rem',
          alignItems: 'start',
        }}
        className="performance-grid"
      >
        {/* Left Column: Staff Selector & Filters */}
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <User style={{ width: '16px', height: '16px', color: 'var(--brand-accent)' }} />
                <span>Staff Directory</span>
              </div>
              <Badge status="neutral">{filteredEmployees.length} staff</Badge>
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search staff by name, ID, role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-control"
                style={{ fontSize: '0.85rem', minHeight: '38px', paddingLeft: '2rem' }}
              />
              <span style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: '0.85rem' }}>
                🔍
              </span>
            </div>

            {/* Date Range Filter */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Filter Analysis Window
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="form-control"
                  style={{ fontSize: '0.75rem', minHeight: '34px', padding: '0.35rem 0.5rem' }}
                />
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="form-control"
                  style={{ fontSize: '0.75rem', minHeight: '34px', padding: '0.35rem 0.5rem' }}
                />
              </div>
              {(periodStart || periodEnd) && (
                <button
                  type="button"
                  onClick={() => {
                    setPeriodStart('');
                    setPeriodEnd('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--brand-accent)',
                    fontSize: '0.75rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                    padding: 0,
                    marginTop: '0.2rem',
                  }}
                >
                  Clear date window
                </button>
              )}
            </div>

            {/* Staff Member List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '520px', overflowY: 'auto' }}>
              {filteredEmployees.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                  No staff members match active criteria.
                </div>
              ) : (
                filteredEmployees.map((emp) => {
                  const isSelected = emp.id === selectedEmployeeId;
                  const fullName = emp.full_name || `${emp.first_name || ''} ${emp.last_name || ''}`;
                  const code = emp.staff_code || emp.employee_code || `EMP-${emp.id}`;
                  return (
                    <div
                      key={emp.id}
                      onClick={() => setSelectedEmployeeId(emp.id)}
                      style={{
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: isSelected ? '1px solid var(--brand-accent)' : '1px solid var(--border-default)',
                        background: isSelected ? 'var(--brand-dim, rgba(37, 99, 235, 0.08))' : 'var(--bg-surface)',
                        cursor: 'pointer',
                        transition: 'var(--transition-fast)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                          {fullName}
                        </strong>
                        <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--brand-accent)' }}>
                          {code}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {emp.job_title || 'Staff'} • {emp.department?.replace('_', ' ') || 'Operations'}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </Card>

        {/* Right Column: Performance Analytics Dashboard */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {error && (
            <div
              style={{
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#dc2626',
                fontSize: '0.86rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <AlertCircle style={{ width: '18px', height: '18px', flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <Card>
              <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚡</div>
                <div>Computing operational metrics and evaluation audit logs...</div>
              </div>
            </Card>
          ) : !performanceData ? (
            <Card>
              <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>👤</div>
                <h4>Select a Staff Member</h4>
                <p style={{ fontSize: '0.86rem', margin: '0.5rem 0 0' }}>
                  Choose an employee from the staff directory to view verified system performance and evaluation trends.
                </p>
              </div>
            </Card>
          ) : (
            <>
              {/* Selected Employee Summary Card */}
              <Card>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div
                      style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '50%',
                        background: 'var(--bg-card)',
                        border: '2px solid var(--border-default)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '1.25rem',
                        color: 'var(--brand-accent)',
                        overflow: 'hidden',
                      }}
                    >
                      {selectedEmp?.photo_url ? (
                        <img
                          src={`/api/v1/employees/${selectedEmp.id}/photo`}
                          alt={selectedEmp.full_name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        `${selectedEmp?.first_name?.[0] || 'E'}${selectedEmp?.last_name?.[0] || 'M'}`
                      )}
                    </div>

                    <div>
                      <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                        {selectedEmp?.full_name || `${selectedEmp?.first_name || ''} ${selectedEmp?.last_name || ''}`}
                      </h2>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem', fontSize: '0.78rem' }}>
                        <span style={{ fontFamily: 'monospace', color: 'var(--brand-accent)', fontWeight: 600 }}>
                          {selectedEmp?.staff_code || selectedEmp?.employee_code || `EMP-${selectedEmp?.id}`}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>•</span>
                        <span>{selectedEmp?.job_title || 'Staff Member'}</span>
                        <span style={{ color: 'var(--text-muted)' }}>•</span>
                        <span>{selectedEmp?.department?.replace('_', ' ') || 'Operations'}</span>
                        <Badge status="success">
                          {selectedEmp?.employment_status || 'ACTIVE'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Observation Window
                    </div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {performanceData.period?.start} to {performanceData.period?.end}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Observed System Operational Metrics */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                  <h3 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Activity style={{ width: '15px', height: '15px', color: 'var(--brand-accent)' }} />
                    System Observed Operational Metrics
                  </h3>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Audit-backed operational logs
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '1rem',
                  }}
                >
                  <Card>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Total System Actions
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                      {performanceData.system_metrics?.total_activities || 0}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Operational events recorded
                    </div>
                  </Card>

                  <Card>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Active Work Days
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--brand-accent)', marginTop: '0.25rem' }}>
                      {performanceData.system_metrics?.active_days || 0}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Days with recorded activity
                    </div>
                  </Card>

                  <Card>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Estimated Attendance
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981', marginTop: '0.25rem' }}>
                      {performanceData.system_metrics?.estimated_attendance_rate}%
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Active days vs schedule ratio
                    </div>
                  </Card>

                  <Card>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Ops Work Items Closed
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#8b5cf6', marginTop: '0.25rem' }}>
                      {(performanceData.system_metrics?.maintenance_resolved || 0) +
                        (performanceData.system_metrics?.inspections_completed || 0)}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Maintenance & inspections
                    </div>
                  </Card>
                </div>
              </div>

              {/* Manager Evaluation vs Operations Breakdown */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: '1.5rem',
                }}
              >
                {/* Formal Manager Evaluation Card */}
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Award style={{ width: '18px', height: '18px', color: '#f59e0b' }} />
                      <span>Formal Manager Evaluation</span>
                    </div>
                  }
                  headerAction={
                    <Badge status="neutral">
                      {performanceData.manager_evaluation?.has_evaluation ? 'FINALIZED' : 'NO REVIEW'}
                    </Badge>
                  }
                >
                  {performanceData.manager_evaluation?.has_evaluation ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '1rem',
                          background: 'rgba(245, 158, 11, 0.08)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(245, 158, 11, 0.25)',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600, textTransform: 'uppercase' }}>
                            Overall Manager Rating
                          </div>
                          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#b45309' }}>
                            {performanceData.manager_evaluation.average_score}%
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          <div>Finalized: {performanceData.manager_evaluation.finalized_at?.slice(0, 10) || 'Recent'}</div>
                          <div>Evaluator: {performanceData.manager_evaluation.evaluator_name || 'Management'}</div>
                        </div>
                      </div>

                      {/* Dimension breakdown */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                          Evaluated Dimension Breakdown
                        </div>

                        {performanceData.manager_evaluation.dimension_scores?.length > 0 ? (
                          performanceData.manager_evaluation.dimension_scores.map((dim, idx) => (
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{dim.criteria_name}</span>
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: dim.score_percentage >= 80 ? '#10b981' : dim.score_percentage >= 60 ? 'var(--brand-accent)' : '#f59e0b',
                                  }}
                                >
                                  {dim.score_percentage}%
                                </span>
                              </div>
                              <div style={{ width: '100%', height: '6px', background: 'var(--bg-surface)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div
                                  style={{
                                    width: `${dim.score_percentage}%`,
                                    height: '100%',
                                    background: dim.score_percentage >= 80 ? '#10b981' : dim.score_percentage >= 60 ? 'var(--brand-accent)' : '#f59e0b',
                                  }}
                                />
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            No individual dimension scores found.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <AlertCircle style={{ width: '28px', height: '28px', margin: '0 auto 0.5rem', opacity: 0.4 }} />
                      <div style={{ fontSize: '0.86rem' }}>
                        No finalized manager evaluation exists for this employee in the selected window.
                      </div>
                      <Button
                        variant="primary"
                        size="small"
                        onClick={() => navigate('/app/evaluations')}
                        style={{ marginTop: '1rem' }}
                      >
                        Create Evaluation
                      </Button>
                    </div>
                  )}
                </Card>

                {/* Operations & Module Distribution */}
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <BarChart2 style={{ width: '18px', height: '18px', color: 'var(--brand-accent)' }} />
                      <span>Operational Module Breakdown</span>
                    </div>
                  }
                  headerAction={<Badge status="neutral">SYSTEM LOGS</Badge>}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.75rem 1rem',
                        background: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-default)',
                        fontSize: '0.84rem',
                      }}
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>Reservations Processed</span>
                      <strong style={{ color: 'var(--brand-accent)', fontSize: '1rem' }}>
                        {performanceData.system_metrics?.reservations_handled || 0}
                      </strong>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.75rem 1rem',
                        background: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-default)',
                        fontSize: '0.84rem',
                      }}
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>Maintenance Orders Resolved</span>
                      <strong style={{ color: '#10b981', fontSize: '1rem' }}>
                        {performanceData.system_metrics?.maintenance_resolved || 0}
                      </strong>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.75rem 1rem',
                        background: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-default)',
                        fontSize: '0.84rem',
                      }}
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>Inspections Completed</span>
                      <strong style={{ color: '#8b5cf6', fontSize: '1rem' }}>
                        {performanceData.system_metrics?.inspections_completed || 0}
                      </strong>
                    </div>

                    {/* Breakdown by Category */}
                    <div style={{ marginTop: '0.5rem' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        Activity Breakdown by Category
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {performanceData.activity_breakdown &&
                        Object.keys(performanceData.activity_breakdown).length > 0 ? (
                          Object.entries(performanceData.activity_breakdown).map(([category, count]) => (
                            <div
                              key={category}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.4rem 0.6rem',
                                borderRadius: '4px',
                                background: 'var(--bg-surface)',
                                fontSize: '0.8rem',
                              }}
                            >
                              <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                                {category.toLowerCase().replace('_', ' ')}
                              </span>
                              <span
                                style={{
                                  fontWeight: 700,
                                  background: 'var(--bg-card)',
                                  padding: '2px 8px',
                                  borderRadius: '10px',
                                  fontSize: '0.75rem',
                                  color: 'var(--text-primary)',
                                  border: '1px solid var(--border-default)',
                                }}
                              >
                                {count}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            No logged operational activities in this window.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
