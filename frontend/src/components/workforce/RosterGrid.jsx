import React, { useState, useEffect, useMemo, useCallback } from 'react';
import RosterToolbar from './RosterToolbar';
import RosterFilters from './RosterFilters';
import RosterShiftCard from './RosterShiftCard';
import RosterAssignmentModal from './RosterAssignmentModal';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { workforceService, employeeService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useProperty } from '../../context/PropertyContext';
import { useToast } from '../../context/ToastContext';
import { Calendar, Clock, AlertTriangle, CheckCircle, RefreshCw } from '../ui/Icons';

export default function RosterGrid({ activePropertyId: propActivePropertyId = 'all' }) {
  const { user } = useAuth();
  const { properties, activePropertyId: contextPropertyId, handleSetProperty } = useProperty();
  const { addToast } = useToast();

  const isOperationsManager = ['OPERATIONS_MANAGER', 'MANAGER'].includes(user?.role);
  const canManage = ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(user?.role);

  // Determine effective property ID (locked for Operations Manager)
  const initialPropertyId = isOperationsManager
    ? (user?.propertyId || user?.property_id || propActivePropertyId || '1')
    : (propActivePropertyId !== 'all' ? propActivePropertyId : contextPropertyId || 'all');

  const [propertyFilter, setPropertyFilter] = useState(initialPropertyId);

  // Sync if context property changes (for Admins)
  useEffect(() => {
    if (!isOperationsManager && propActivePropertyId) {
      setPropertyFilter(propActivePropertyId);
    }
  }, [propActivePropertyId, isOperationsManager]);

  // Date and Calendar Navigation
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState('weekly'); // 'weekly' or 'daily'

  // Data states
  const [loading, setLoading] = useState(false);
  const [shifts, setShifts] = useState([]);
  const [rosters, setRosters] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [templates, setTemplates] = useState([]);

  // Filter states
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [shiftStatusFilter, setShiftStatusFilter] = useState('ALL');
  const [coverageFilter, setCoverageFilter] = useState('ALL');

  // Modal states
  const [assignmentModalShift, setAssignmentModalShift] = useState(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState(null);

  const [isCreateShiftOpen, setIsCreateShiftOpen] = useState(false);
  const [createShiftLoading, setCreateShiftLoading] = useState(false);
  const [createShiftError, setCreateShiftError] = useState(null);
  const [shiftForm, setShiftForm] = useState({
    roster_id: '',
    property_id: '',
    department: 'OPERATIONS',
    template_id: '',
    shift_date: '',
    start_time: '08:00',
    end_time: '16:00',
    break_minutes: 60,
    employee_id: '',
    notes: '',
  });

  const [isCreateRosterOpen, setIsCreateRosterOpen] = useState(false);
  const [createRosterLoading, setCreateRosterLoading] = useState(false);
  const [rosterForm, setRosterForm] = useState({
    property_id: '',
    title: '',
    start_date: '',
    end_date: '',
    notes: '',
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Date Helpers (Monday through Sunday)
  // ─────────────────────────────────────────────────────────────────────────
  const weekDays = useMemo(() => {
    const d = new Date(anchorDate);
    const day = d.getDay();
    // Monday as day 0
    const diff = d.getDate() - (day === 0 ? 6 : day - 1);
    const monday = new Date(d);
    monday.setDate(diff);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const next = new Date(monday);
      next.setDate(monday.getDate() + i);
      days.push(next);
    }
    return days;
  }, [anchorDate]);

  const formatDateISO = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const weekStartISO = useMemo(() => formatDateISO(weekDays[0]), [weekDays]);
  const weekEndISO = useMemo(() => formatDateISO(weekDays[6]), [weekDays]);
  const anchorDateISO = useMemo(() => formatDateISO(anchorDate), [anchorDate]);

  // Formatted Label for Toolbar
  const dateLabel = useMemo(() => {
    if (viewMode === 'daily') {
      return anchorDate.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    const startStr = weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const endStr = weekDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startStr} – ${endStr}`;
  }, [viewMode, anchorDate, weekDays]);

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch Core Data (Shifts, Rosters, Templates, Employees)
  // ─────────────────────────────────────────────────────────────────────────
  const fetchWorkforceData = useCallback(async () => {
    setLoading(true);
    try {
      const propId = propertyFilter !== 'all' ? propertyFilter : undefined;

      // 1. Fetch Rosters for Date Range
      const rosterParams = {
        propertyId: propId,
        startDate: viewMode === 'weekly' ? weekStartISO : anchorDateISO,
        endDate: viewMode === 'weekly' ? weekEndISO : anchorDateISO,
      };
      const rosterRes = await workforceService.getRosters(rosterParams);
      const loadedRosters = rosterRes?.data || rosterRes || [];
      setRosters(loadedRosters);

      // 2. Fetch Shifts
      const shiftParams = {
        propertyId: propId,
        startDate: viewMode === 'weekly' ? weekStartISO : anchorDateISO,
        endDate: viewMode === 'weekly' ? weekEndISO : anchorDateISO,
      };
      if (departmentFilter !== 'ALL') {
        shiftParams.department = departmentFilter;
      }
      const shiftRes = await workforceService.getShifts(shiftParams);
      const loadedShifts = shiftRes?.data || shiftRes || [];
      setShifts(loadedShifts);

      // 3. Fetch Templates & Employees in parallel
      const [tmplRes, empRes] = await Promise.all([
        workforceService.getTemplates({ propertyId: propId }),
        employeeService.getAll(),
      ]);
      setTemplates(tmplRes?.data || tmplRes || []);
      setEmployees(empRes?.data || empRes || []);
    } catch (err) {
      console.error('Failed to load workforce roster data:', err);
      addToast(`Error loading roster data: ${err.message || 'Network error'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [propertyFilter, viewMode, weekStartISO, weekEndISO, anchorDateISO, departmentFilter, addToast]);

  useEffect(() => {
    fetchWorkforceData();
  }, [fetchWorkforceData]);

  // Active Roster container for current view
  const activeRoster = useMemo(() => {
    if (rosters.length === 0) return null;
    if (propertyFilter !== 'all') {
      return rosters.find((r) => String(r.property_id) === String(propertyFilter)) || rosters[0];
    }
    return rosters[0];
  }, [rosters, propertyFilter]);

  // ─────────────────────────────────────────────────────────────────────────
  // Client-Side Filter Pipeline
  // ─────────────────────────────────────────────────────────────────────────
  const filteredShifts = useMemo(() => {
    return shifts.filter((shift) => {
      // Department
      if (departmentFilter !== 'ALL' && shift.department !== departmentFilter) {
        return false;
      }
      // Status
      if (shiftStatusFilter !== 'ALL' && shift.status !== shiftStatusFilter) {
        return false;
      }
      // Coverage filter
      if (coverageFilter === 'UNASSIGNED' && shift.employee_id) {
        return false;
      }
      if (coverageFilter === 'ASSIGNED' && !shift.employee_id) {
        return false;
      }
      // Employee Search (name or code)
      if (employeeSearch.trim()) {
        const q = employeeSearch.toLowerCase();
        const matchesName = shift.employee_name?.toLowerCase().includes(q);
        const matchesCode = shift.employee_code?.toLowerCase().includes(q);
        const matchesTitle = shift.job_title?.toLowerCase().includes(q);
        return matchesName || matchesCode || matchesTitle;
      }
      return true;
    });
  }, [shifts, departmentFilter, shiftStatusFilter, coverageFilter, employeeSearch]);

  // Metrics
  const shiftStats = useMemo(() => {
    const total = filteredShifts.length;
    const assigned = filteredShifts.filter((s) => s.employee_id).length;
    const unassigned = total - assigned;
    const coveragePct = total > 0 ? Math.round((assigned / total) * 100) : 100;
    return { total, assigned, unassigned, coveragePct };
  }, [filteredShifts]);

  // Group shifts by shift_date (YYYY-MM-DD)
  const shiftsByDate = useMemo(() => {
    const map = {};
    for (const shift of filteredShifts) {
      const rawDate = shift.shift_date ? shift.shift_date.slice(0, 10) : '';
      if (!map[rawDate]) map[rawDate] = [];
      map[rawDate].push(shift);
    }
    return map;
  }, [filteredShifts]);

  // ─────────────────────────────────────────────────────────────────────────
  // Shift Assignment Actions & Conflict Engine Handling
  // ─────────────────────────────────────────────────────────────────────────
  const handleOpenAssignModal = (shift) => {
    setAssignmentModalShift(shift);
    setAssignError(null);
  };

  const handleConfirmAssignment = async (shift, targetEmployeeId) => {
    setAssignLoading(true);
    setAssignError(null);
    try {
      await workforceService.updateShift(shift.id, {
        employee_id: targetEmployeeId,
      });

      addToast(
        targetEmployeeId === null
          ? 'Shift unassigned successfully.'
          : 'Employee assigned to shift successfully!',
        'success'
      );
      setAssignmentModalShift(null);
      fetchWorkforceData();
    } catch (err) {
      console.error('Assignment error:', err);
      const msg = err.message || 'Conflict: Unable to assign employee to this shift.';
      setAssignError(msg);
      addToast(msg, 'error');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleUnassignShift = async (shift) => {
    if (!window.confirm(`Unassign ${shift.employee_name || 'employee'} from this shift?`)) return;
    try {
      await workforceService.updateShift(shift.id, { employee_id: null });
      addToast('Shift unassigned successfully.', 'success');
      fetchWorkforceData();
    } catch (err) {
      addToast(`Failed to unassign shift: ${err.message}`, 'error');
    }
  };

  const handleDeleteShift = async (shift) => {
    if (!window.confirm(`Delete shift #${shift.id} (${shift.start_time?.slice(0, 5)} - ${shift.end_time?.slice(0, 5)})?`)) return;
    try {
      await workforceService.deleteShift(shift.id);
      addToast('Shift deleted successfully.', 'success');
      fetchWorkforceData();
    } catch (err) {
      addToast(`Failed to delete shift: ${err.message}`, 'error');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Create Shift Dialog & Auto-Roster Initialization
  // ─────────────────────────────────────────────────────────────────────────
  const handleOpenCreateShift = (prefilledDate = null) => {
    const defaultDate = prefilledDate || (viewMode === 'daily' ? anchorDateISO : weekStartISO);
    const targetPropId = propertyFilter !== 'all' ? propertyFilter : (properties[0]?.id || '1');

    setShiftForm({
      roster_id: activeRoster?.id || '',
      property_id: targetPropId,
      department: 'OPERATIONS',
      template_id: '',
      shift_date: defaultDate,
      start_time: '08:00',
      end_time: '16:00',
      break_minutes: 60,
      employee_id: '',
      notes: '',
    });
    setCreateShiftError(null);
    setIsCreateShiftOpen(true);
  };

  const handleTemplateSelect = (templateId) => {
    const tmpl = templates.find((t) => String(t.id) === String(templateId));
    if (tmpl) {
      setShiftForm((prev) => ({
        ...prev,
        template_id: tmpl.id,
        department: tmpl.department || prev.department,
        start_time: tmpl.start_time?.slice(0, 5) || prev.start_time,
        end_time: tmpl.end_time?.slice(0, 5) || prev.end_time,
        break_minutes: tmpl.break_minutes ?? prev.break_minutes,
      }));
    } else {
      setShiftForm((prev) => ({ ...prev, template_id: '' }));
    }
  };

  const handleSubmitCreateShift = async (e) => {
    e.preventDefault();
    setCreateShiftLoading(true);
    setCreateShiftError(null);

    try {
      let rosterId = shiftForm.roster_id;

      // Auto-create roster if none exists for this week & property
      if (!rosterId) {
        const rosterTitle = `Roster ${weekStartISO} to ${weekEndISO}`;
        const newRoster = await workforceService.createRoster({
          property_id: Number(shiftForm.property_id),
          title: rosterTitle,
          start_date: weekStartISO,
          end_date: weekEndISO,
          notes: 'Auto-initialized by schedule planner',
        });
        rosterId = newRoster?.data?.id || newRoster?.id;
      }

      const payload = {
        roster_id: Number(rosterId),
        property_id: Number(shiftForm.property_id),
        department: shiftForm.department,
        template_id: shiftForm.template_id ? Number(shiftForm.template_id) : null,
        shift_date: shiftForm.shift_date,
        start_time: shiftForm.start_time,
        end_time: shiftForm.end_time,
        break_minutes: Number(shiftForm.break_minutes || 60),
        employee_id: shiftForm.employee_id ? Number(shiftForm.employee_id) : null,
        notes: shiftForm.notes || null,
      };

      await workforceService.scheduleShift(payload);
      addToast('Duty shift scheduled successfully!', 'success');
      setIsCreateShiftOpen(false);
      fetchWorkforceData();
    } catch (err) {
      console.error('Create shift error:', err);
      const msg = err.message || 'Failed to schedule shift.';
      setCreateShiftError(msg);
      addToast(msg, 'error');
    } finally {
      setCreateShiftLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Create & Publish Roster Dialogs
  // ─────────────────────────────────────────────────────────────────────────
  const handleOpenCreateRoster = () => {
    const targetPropId = propertyFilter !== 'all' ? propertyFilter : (properties[0]?.id || '1');
    setRosterForm({
      property_id: targetPropId,
      title: `Schedule ${weekStartISO} - ${weekEndISO}`,
      start_date: weekStartISO,
      end_date: weekEndISO,
      notes: '',
    });
    setIsCreateRosterOpen(true);
  };

  const handleSubmitCreateRoster = async (e) => {
    e.preventDefault();
    setCreateRosterLoading(true);
    try {
      await workforceService.createRoster({
        property_id: Number(roosterForm.property_id),
        title: rosterForm.title,
        start_date: rosterForm.start_date,
        end_date: rosterForm.end_date,
        notes: rosterForm.notes,
      });
      addToast('Workforce roster container initialized!', 'success');
      setIsCreateRosterOpen(false);
      fetchWorkforceData();
    } catch (err) {
      addToast(`Error creating roster: ${err.message}`, 'error');
    } finally {
      setCreateRosterLoading(false);
    }
  };

  const handlePublishRoster = async (rosterId) => {
    if (!window.confirm('Publish this roster? All assigned employees will receive official duty schedule access.')) {
      return;
    }
    try {
      const res = await workforceService.publishRoster(rosterId);
      const warnings = res?.warnings || res?.data?.warnings || [];
      if (warnings.length > 0) {
        addToast(`Roster published with warning: ${warnings[0]}`, 'warning');
      } else {
        addToast('Official roster published successfully!', 'success');
      }
      fetchWorkforceData();
    } catch (err) {
      addToast(`Failed to publish roster: ${err.message}`, 'error');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Navigation Callbacks
  // ─────────────────────────────────────────────────────────────────────────
  const handlePrevDate = () => {
    setAnchorDate((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() - (viewMode === 'weekly' ? 7 : 1));
      return next;
    });
  };

  const handleNextDate = () => {
    setAnchorDate((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + (viewMode === 'weekly' ? 7 : 1));
      return next;
    });
  };

  const handleToday = () => {
    setAnchorDate(new Date());
  };

  const handleResetFilters = () => {
    setDepartmentFilter('ALL');
    setShiftStatusFilter('ALL');
    setCoverageFilter('ALL');
    setEmployeeSearch('');
  };

  const isToday = (d) => {
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="roster-grid-container">
      {/* 1. Roster Navigation & Metric Toolbar */}
      <RosterToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        dateLabel={dateLabel}
        anchorDate={anchorDate}
        onPrevDate={handlePrevDate}
        onNextDate={handleNextDate}
        onToday={handleToday}
        onDateSelect={setAnchorDate}
        canManage={canManage}
        onOpenCreateShift={() => handleOpenCreateShift()}
        onOpenCreateRoster={handleOpenCreateRoster}
        onPublishRoster={handlePublishRoster}
        activeRoster={activeRoster}
        shiftStats={shiftStats}
      />

      {/* 2. Multi-Criteria Filter Bar */}
      <RosterFilters
        properties={properties}
        activePropertyId={propertyFilter}
        onPropertyChange={setPropertyFilter}
        department={departmentFilter}
        onDepartmentChange={setDepartmentFilter}
        employeeSearch={employeeSearch}
        onEmployeeSearchChange={setEmployeeSearch}
        shiftStatus={shiftStatusFilter}
        onShiftStatusChange={setShiftStatusFilter}
        coverageFilter={coverageFilter}
        onCoverageFilterChange={setCoverageFilter}
        onResetFilters={handleResetFilters}
        canSwitchProperty={!isOperationsManager}
      />

      {/* 3. Main Roster Calendar Visualization */}
      {loading ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-muted)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <RefreshCw size={24} className="spin-animation" style={{ color: 'var(--primary-color, #10b981)' }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Loading workforce schedule matrix...</span>
        </div>
      ) : viewMode === 'weekly' ? (
        /* WEEKLY 7-DAY CALENDAR GRID */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(170px, 1fr))',
            gap: '0.65rem',
            overflowX: 'auto',
            paddingBottom: '0.5rem',
          }}
          className="roster-weekly-grid"
        >
          {weekDays.map((day) => {
            const dayISO = formatDateISO(day);
            const dayShifts = shiftsByDate[dayISO] || [];
            const dayIsToday = isToday(day);

            return (
              <div
                key={dayISO}
                style={{
                  background: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: dayIsToday ? '2px solid #10b981' : '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: '420px',
                  boxShadow: dayIsToday ? '0 0 0 1px rgba(16, 185, 129, 0.2)' : 'none',
                }}
                className="roster-day-column"
              >
                {/* Day Header */}
                <div
                  style={{
                    padding: '0.65rem 0.75rem',
                    background: dayIsToday ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-card)',
                    borderBottom: '1px solid var(--border-color)',
                    borderTopLeftRadius: 'var(--radius-md)',
                    borderTopRightRadius: 'var(--radius-md)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: dayIsToday ? '#10b981' : 'var(--text-muted)',
                      }}
                    >
                      {day.toLocaleDateString(undefined, { weekday: 'short' })}
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {day.getDate()}
                    </div>
                  </div>

                  {canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenCreateShift(dayISO)}
                      style={{
                        width: '26px',
                        height: '26px',
                        padding: 0,
                        fontSize: '1rem',
                        lineHeight: 1,
                        color: 'var(--text-secondary)',
                      }}
                      title={`Add shift for ${dayISO}`}
                    >
                      +
                    </Button>
                  )}
                </div>

                {/* Day Shifts Stack */}
                <div
                  style={{
                    padding: '0.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    flex: 1,
                  }}
                >
                  {dayShifts.length === 0 ? (
                    <div
                      style={{
                        padding: '1.5rem 0.5rem',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        fontSize: '0.75rem',
                        fontStyle: 'italic',
                      }}
                    >
                      No shifts scheduled
                      {canManage && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <button
                            onClick={() => handleOpenCreateShift(dayISO)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--primary-color, #10b981)',
                              fontSize: '0.72rem',
                              cursor: 'pointer',
                              fontWeight: 600,
                              textDecoration: 'underline',
                            }}
                          >
                            + Schedule Shift
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    dayShifts.map((shift) => (
                      <RosterShiftCard
                        key={shift.id}
                        shift={shift}
                        canManage={canManage}
                        onAssign={handleOpenAssignModal}
                        onUnassign={handleUnassignShift}
                        onDelete={handleDeleteShift}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* DAILY SCHEDULE VIEW (Compact, Timeline-Optimized) */
        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            padding: '1.25rem',
          }}
          className="roster-daily-view"
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {anchorDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </h3>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {filteredShifts.length} shift(s) scheduled for this date.
              </p>
            </div>

            {canManage && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleOpenCreateShift(anchorDateISO)}
                style={{ fontSize: '0.8rem' }}
              >
                + Add Shift for This Day
              </Button>
            )}
          </div>

          {filteredShifts.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📅</div>
              <p style={{ margin: 0, fontWeight: 600 }}>No duty shifts scheduled for this date.</p>
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenCreateShift(anchorDateISO)}
                  style={{ marginTop: '0.75rem' }}
                >
                  + Add First Shift
                </Button>
              )}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '0.85rem',
              }}
            >
              {filteredShifts.map((shift) => (
                <RosterShiftCard
                  key={shift.id}
                  shift={shift}
                  canManage={canManage}
                  onAssign={handleOpenAssignModal}
                  onUnassign={handleUnassignShift}
                  onDelete={handleDeleteShift}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. Shift Assignment Modal */}
      {assignmentModalShift && (
        <RosterAssignmentModal
          isOpen={Boolean(assignmentModalShift)}
          onClose={() => {
            setAssignmentModalShift(null);
            setAssignError(null);
          }}
          shift={assignmentModalShift}
          employees={employees}
          onConfirmAssignment={handleConfirmAssignment}
          loading={assignLoading}
          error={assignError}
        />
      )}

      {/* 5. Create Shift Modal */}
      {isCreateShiftOpen && (
        <Modal
          isOpen={isCreateShiftOpen}
          onClose={() => setIsCreateShiftOpen(false)}
          title="Schedule Duty Shift"
          subtitle="Assign working hours and operational department to a staff roster"
          size="md"
        >
          <form onSubmit={handleSubmitCreateShift} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {createShiftError && (
              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid #ef4444',
                  color: '#ef4444',
                  fontSize: '0.82rem',
                }}
              >
                <strong>Scheduling Conflict / Error:</strong> {createShiftError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label className="input-label" style={{ fontSize: '0.78rem' }}>Property</label>
                <select
                  className="input-field"
                  value={shiftForm.property_id}
                  onChange={(e) => setShiftForm({ ...shiftForm, property_id: e.target.value })}
                  disabled={isOperationsManager}
                  required
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name || `Property #${p.id}`}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="input-label" style={{ fontSize: '0.78rem' }}>Department</label>
                <select
                  className="input-field"
                  value={shiftForm.department}
                  onChange={(e) => setShiftForm({ ...shiftForm, department: e.target.value })}
                  required
                >
                  <option value="OPERATIONS">Operations</option>
                  <option value="FRONT_DESK">Front Desk</option>
                  <option value="HOUSEKEEPING">Housekeeping</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="SECURITY">Security</option>
                  <option value="MANAGEMENT">Management</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>

            {/* Shift Template Pre-fill Selector */}
            {templates.length > 0 && (
              <div>
                <label className="input-label" style={{ fontSize: '0.78rem' }}>Load Shift Template (Optional)</label>
                <select
                  className="input-field"
                  value={shiftForm.template_id}
                  onChange={(e) => handleTemplateSelect(e.target.value)}
                >
                  <option value="">Custom Shift Times</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.start_time?.slice(0, 5)} - {t.end_time?.slice(0, 5)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label className="input-label" style={{ fontSize: '0.78rem' }}>Shift Date</label>
                <input
                  type="date"
                  className="input-field"
                  value={shiftForm.shift_date}
                  onChange={(e) => setShiftForm({ ...shiftForm, shift_date: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="input-label" style={{ fontSize: '0.78rem' }}>Start Time</label>
                <input
                  type="time"
                  className="input-field"
                  value={shiftForm.start_time}
                  onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="input-label" style={{ fontSize: '0.78rem' }}>End Time</label>
                <input
                  type="time"
                  className="input-field"
                  value={shiftForm.end_time}
                  onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label className="input-label" style={{ fontSize: '0.78rem' }}>Assign Staff (Optional)</label>
                <select
                  className="input-field"
                  value={shiftForm.employee_id}
                  onChange={(e) => setShiftForm({ ...shiftForm, employee_id: e.target.value })}
                >
                  <option value="">Leave Unassigned (Open Slot)</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.employee_code || `EMP-${emp.id}`})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="input-label" style={{ fontSize: '0.78rem' }}>Break Allotment (Mins)</label>
                <input
                  type="number"
                  min="0"
                  step="15"
                  className="input-field"
                  value={shiftForm.break_minutes}
                  onChange={(e) => setShiftForm({ ...shiftForm, break_minutes: Number(e.target.value) })}
                />
              </div>
            </div>

            <div>
              <label className="input-label" style={{ fontSize: '0.78rem' }}>Operational Instructions / Notes</label>
              <input
                type="text"
                placeholder="e.g. Keycard handover, morning lobby coverage"
                className="input-field"
                value={shiftForm.notes}
                onChange={(e) => setShiftForm({ ...shiftForm, notes: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
              <Button type="button" variant="secondary" onClick={() => setIsCreateShiftOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={createShiftLoading}>
                Schedule Shift
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* 6. Create Roster Container Modal */}
      {isCreateRosterOpen && (
        <Modal
          isOpen={isCreateRosterOpen}
          onClose={() => setIsCreateRosterOpen(false)}
          title="Create New Workforce Roster"
          subtitle="Initialize a weekly or monthly schedule container"
          size="md"
        >
          <form onSubmit={handleSubmitCreateRoster} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="input-label" style={{ fontSize: '0.78rem' }}>Property</label>
              <select
                className="input-field"
                value={rosterForm.property_id}
                onChange={(e) => setRosterForm({ ...rosterForm, property_id: e.target.value })}
                disabled={isOperationsManager}
                required
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name || `Property #${p.id}`}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="input-label" style={{ fontSize: '0.78rem' }}>Roster Title</label>
              <input
                type="text"
                placeholder="e.g. Week 45 Operations Schedule"
                className="input-field"
                value={rosterForm.title}
                onChange={(e) => setRosterForm({ ...rosterForm, title: e.target.value })}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label className="input-label" style={{ fontSize: '0.78rem' }}>Start Date</label>
                <input
                  type="date"
                  className="input-field"
                  value={rosterForm.start_date}
                  onChange={(e) => setRosterForm({ ...rosterForm, start_date: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="input-label" style={{ fontSize: '0.78rem' }}>End Date</label>
                <input
                  type="date"
                  className="input-field"
                  value={rosterForm.end_date}
                  onChange={(e) => setRosterForm({ ...rosterForm, end_date: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <label className="input-label" style={{ fontSize: '0.78rem' }}>Roster Notes</label>
              <textarea
                placeholder="Planning notes, department focus, handover guidelines..."
                className="input-field"
                rows={2}
                value={rosterForm.notes}
                onChange={(e) => setRosterForm({ ...rosterForm, notes: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
              <Button type="button" variant="secondary" onClick={() => setIsCreateRosterOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={createRosterLoading}>
                Initialize Roster
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
