import React, { useState, useEffect, useMemo } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import RosterGrid from '../../components/workforce/RosterGrid';
import AttendancePolicyModal from '../../components/workforce/AttendancePolicyModal';
import KioskManagementModal from '../../components/workforce/KioskManagementModal';
import ManualPunchModal from '../../components/workforce/ManualPunchModal';
import AbsenceCalendar from '../../components/workforce/AbsenceCalendar';
import { workforceService, employeeService, propertyService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useProperty } from '../../context/PropertyContext';
import { useToast } from '../../context/ToastContext';
import {
  Clock,
  Calendar,
  User,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Download,
  RefreshCw,
  Search,
  Filter,
  MapPin,
  ShieldCheck,
} from '../../components/ui/Icons';

export default function WorkforcePage() {
  const { user } = useAuth();
  const { properties, activePropertyId } = useProperty();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      if (['roster', 'attendance', 'leave', 'timesheets', 'swaps'].includes(tabParam)) {
        return tabParam;
      }
      if (window.location.hash) {
        const hash = window.location.hash.replace('#', '');
        if (['roster', 'attendance', 'leave', 'timesheets', 'swaps'].includes(hash)) {
          return hash;
        }
      }
    }
    return 'attendance';
  }); // 'roster', 'attendance', 'leave', 'timesheets', 'swaps'
  const [loading, setLoading] = useState(false);

  // Selected date / filters
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [filterDate, setFilterDate] = useState(todayStr);
  const [filterPropertyId, setFilterPropertyId] = useState(activePropertyId || 'all');

  // Tab 1: Attendance State
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [reviewCorrectionModal, setReviewCorrectionModal] = useState(null);
  const [correctionNote, setCorrectionNote] = useState('');

  // DEF-B05: Attendance Exception Review Modal States
  const [reviewAttendanceModal, setReviewAttendanceModal] = useState(null);
  const [reviewAttendanceAction, setReviewAttendanceAction] = useState('VERIFY'); // 'VERIFY' | 'FLAG_REJECTED'
  const [reviewAttendanceNotes, setReviewAttendanceNotes] = useState('');
  const [reviewAttendanceLoading, setReviewAttendanceLoading] = useState(false);

  // Stage 2.2: Policy, Kiosk & Manual Punch Modal States
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [isKioskModalOpen, setIsKioskModalOpen] = useState(false);
  const [isManualPunchOpen, setIsManualPunchOpen] = useState(false);

  // Tab 2: Leave State
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [leaveCategories, setLeaveCategories] = useState([]);
  const [reviewLeaveModal, setReviewLeaveModal] = useState(null);
  const [leaveReviewStatus, setLeaveReviewStatus] = useState('APPROVED');
  const [leaveReviewNote, setLeaveReviewNote] = useState('');
  const [leaveSubTab, setLeaveSubTab] = useState('queue'); // 'queue' | 'calendar'

  // Tab 3: Timesheets State
  const [timesheetStart, setTimesheetStart] = useState(() => {
    const d = new Date();
    d.setDate(1); // 1st of current month
    return d.toISOString().split('T')[0];
  });
  const [timesheetEnd, setTimesheetEnd] = useState(todayStr);
  const [timesheets, setTimesheets] = useState([]);

  // Tab 4: Shift Swaps State
  const [swaps, setSwaps] = useState([]);
  const [reviewSwapModal, setReviewSwapModal] = useState(null);
  const [swapReviewStatus, setSwapReviewStatus] = useState('APPROVED');
  const [swapReviewNote, setSwapReviewNote] = useState('');

  // Employees lookup
  const [employees, setEmployees] = useState([]);

  // Fetch initial data
  useEffect(() => {
    fetchEmployees();
    fetchLeaveCategories();
  }, []);

  useEffect(() => {
    if (activeTab === 'attendance') {
      fetchAttendance();
      fetchCorrections();
    } else if (activeTab === 'leave') {
      fetchLeaveRequests();
      fetchLeaveBalances();
    } else if (activeTab === 'timesheets') {
      fetchTimesheets();
    } else if (activeTab === 'swaps') {
      fetchSwaps();
    }
  }, [activeTab, filterDate, filterPropertyId, timesheetStart, timesheetEnd]);

  const fetchEmployees = async () => {
    try {
      const res = await employeeService.getAll();
      const list = res?.data?.employees || (Array.isArray(res?.data) ? res.data : (Array.isArray(res?.employees) ? res.employees : (Array.isArray(res) ? res : [])));
      setEmployees(list);
    } catch (err) {
      console.error('Failed to load employees:', err);
    }
  };

  const fetchLeaveCategories = async () => {
    try {
      const res = await workforceService.getLeaveCategories();
      setLeaveCategories(res?.data || res || []);
    } catch (err) {
      console.error('Failed to load leave categories:', err);
    }
  };

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const params = { date: filterDate };
      if (filterPropertyId && filterPropertyId !== 'all') {
        params.propertyId = filterPropertyId;
      }
      const res = await workforceService.getAttendance(params);
      setAttendanceRecords(res?.data || res || []);
    } catch (err) {
      addToast(`Error loading attendance: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchCorrections = async () => {
    try {
      const res = await workforceService.getCorrections({ status: 'PENDING' });
      setCorrections(res?.data || res || []);
    } catch (err) {
      console.error('Failed to load corrections:', err);
    }
  };

  const fetchLeaveRequests = async () => {
    setLoading(true);
    try {
      const res = await workforceService.getLeaveRequests();
      setLeaveRequests(res?.data || res || []);
    } catch (err) {
      addToast(`Error loading leave requests: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchLeaveBalances = async () => {
    try {
      const res = await workforceService.getLeaveBalances();
      setLeaveBalances(res?.data || res || []);
    } catch (err) {
      console.error('Failed to load leave balances:', err);
    }
  };

  const fetchTimesheets = async () => {
    setLoading(true);
    try {
      const params = { startDate: timesheetStart, endDate: timesheetEnd };
      if (filterPropertyId && filterPropertyId !== 'all') {
        params.propertyId = filterPropertyId;
      }
      const res = await workforceService.getTimesheets(params);
      setTimesheets(res?.data || res || []);
    } catch (err) {
      addToast(`Error loading timesheets: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchSwaps = async () => {
    setLoading(true);
    try {
      const res = await workforceService.getSwaps();
      setSwaps(res?.data || res || []);
    } catch (err) {
      addToast(`Error loading shift swaps: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handlers for Corrections
  const handleReviewCorrection = async (status) => {
    if (!reviewCorrectionModal) return;
    try {
      await workforceService.reviewCorrection(reviewCorrectionModal.id, {
        status,
        manager_notes: correctionNote,
      });
      addToast(`Correction request ${status.toLowerCase()}!`, 'success');
      setReviewCorrectionModal(null);
      setCorrectionNote('');
      fetchCorrections();
      fetchAttendance();
    } catch (err) {
      addToast(`Action failed: ${err.message}`, 'error');
    }
  };

  // Handlers for Leave Requests (DEF-B10 fixed: payload requires { action, notes })
  const handleReviewLeave = async (overrideAction) => {
    if (!reviewLeaveModal) return;
    const actionToSend = overrideAction || leaveReviewStatus;
    try {
      await workforceService.reviewLeave(reviewLeaveModal.id, {
        action: actionToSend,
        notes: leaveReviewNote,
      });
      const actionLabel =
        actionToSend === 'APPROVED'
          ? 'approved'
          : actionToSend === 'REJECTED'
          ? 'rejected'
          : 'escalated to Administrator';
      addToast(`Leave request ${actionLabel} successfully!`, 'success');
      setReviewLeaveModal(null);
      setLeaveReviewNote('');
      fetchLeaveRequests();
      fetchLeaveBalances();
    } catch (err) {
      addToast(`Action failed: ${err.message}`, 'error');
    }
  };

  // Handlers for Shift Swaps
  const handleReviewSwap = async () => {
    if (!reviewSwapModal) return;
    try {
      await workforceService.reviewSwap(reviewSwapModal.id, {
        status: swapReviewStatus,
        manager_notes: swapReviewNote,
      });
      addToast(`Shift swap request ${swapReviewStatus.toLowerCase()}!`, 'success');
      setReviewSwapModal(null);
      setSwapReviewNote('');
      fetchSwaps();
    } catch (err) {
      addToast(`Action failed: ${err.message}`, 'error');
    }
  };

  // Timesheets export CSV trigger
  const handleExportCsv = () => {
    const token = localStorage.getItem('bfa_auth_token');
    const params = {
      startDate: timesheetStart,
      endDate: timesheetEnd,
    };
    if (filterPropertyId && filterPropertyId !== 'all') {
      params.propertyId = filterPropertyId;
    }
    const q = new URLSearchParams(params).toString();
    const exportUrl = `/api/v1/workforce/timesheets/export?${q}`;

    // Download using authenticated fetch to handle token
    fetch(exportUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bfa_timesheets_${timesheetStart}_to_${timesheetEnd}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        addToast('Timesheet CSV downloaded successfully.', 'success');
      })
      .catch((err) => addToast(`Export failed: ${err.message}`, 'error'));
  };

  // Quick stats calculations for today's attendance
  const attendanceStats = useMemo(() => {
    const total = attendanceRecords.length;
    const onDuty = attendanceRecords.filter((a) => (a.clock_in || a.clock_in_time) && !(a.clock_out || a.clock_out_time) && !a.on_break).length;
    const onBreak = attendanceRecords.filter((a) => a.on_break || (a.break_start_time && !a.break_end_time)).length;
    const lateArrivals = attendanceRecords.filter((a) => a.attendance_status === 'LATE' || a.is_late).length;
    const locationExceptions = attendanceRecords.filter((a) => a.requires_review === 1 || (a.is_verified === 0 && !a.verified_by_id)).length;
    return { total, onDuty, onBreak, lateArrivals, locationExceptions };
  }, [attendanceRecords]);

  // Maker-checker helper: acting manager cannot review their own punch record
  const isOwnPunch = (record) => {
    if (!user || !record) return false;
    if (user.employee_id && String(record.employee_id) === String(user.employee_id)) return true;
    if (user.employeeId && String(record.employee_id) === String(user.employeeId)) return true;
    if (record.user_id && String(record.user_id) === String(user.id)) return true;
    const empList = Array.isArray(employees) ? employees : (Array.isArray(employees?.employees) ? employees.employees : []);
    const emp = empList.find((e) => String(e.id) === String(record.employee_id));
    if (emp && emp.user_id && String(emp.user_id) === String(user.id)) return true;
    return false;
  };

  const isManagement = ['ADMIN', 'OWNER', 'SUPER_ADMIN', 'OPERATIONS_MANAGER', 'MANAGER'].includes(user?.role);
  const userRole = (user?.role || '').toUpperCase();
  const isAdmin = ['ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(userRole);
  const isOpsManager = ['OPERATIONS_MANAGER', 'MANAGER'].includes(userRole);

  // Maker-checker helper: user cannot review their own leave application
  const isOwnLeave = (req) => {
    if (!user || !req) return false;
    if (user.employee_id && String(req.employee_id) === String(user.employee_id)) return true;
    if (user.employeeId && String(req.employee_id) === String(user.employeeId)) return true;
    if (req.user_id && String(req.user_id) === String(user.id)) return true;
    const empList = Array.isArray(employees) ? employees : (Array.isArray(employees?.employees) ? employees.employees : []);
    const emp = empList.find((e) => String(e.id) === String(req.employee_id));
    if (emp && emp.user_id && String(emp.user_id) === String(user.id)) return true;
    return false;
  };

  const handleOpenReviewLeave = (req) => {
    setReviewLeaveModal(req);
    const exceedsLimit = !isAdmin && (req.total_days > 14);
    setLeaveReviewStatus(exceedsLimit ? 'ESCALATED' : 'APPROVED');
    setLeaveReviewNote('');
  };

  // Handlers for Attendance Exception Review (DEF-B05)
  const handleOpenReviewAttendanceModal = (record) => {
    setReviewAttendanceModal(record);
    setReviewAttendanceAction('VERIFY');
    setReviewAttendanceNotes('');
  };

  const handleReviewAttendanceSubmit = async (e) => {
    e.preventDefault();
    if (!reviewAttendanceModal) return;
    setReviewAttendanceLoading(true);
    try {
      await workforceService.verifyAttendance(reviewAttendanceModal.id, {
        action: reviewAttendanceAction,
        reviewNotes: reviewAttendanceNotes.trim(),
      });
      addToast(
        `Attendance exception ${reviewAttendanceAction === 'VERIFY' ? 'verified & approved' : 'flagged as rejected'} successfully!`,
        'success'
      );
      setReviewAttendanceModal(null);
      setReviewAttendanceNotes('');
      fetchAttendance();
    } catch (err) {
      addToast(`Verification failed: ${err.message}`, 'error');
    } finally {
      setReviewAttendanceLoading(false);
    }
  };

  // Timesheets summary metrics
  const timesheetTotals = useMemo(() => {
    let regular = 0;
    let overtime = 0;
    let leave = 0;
    let totalPayable = 0;

    timesheets.forEach((t) => {
      const reg = parseFloat(t.regular_hours || t.actual_hours || 0);
      const ot = parseFloat(t.overtime_hours || 0);
      const lv = parseFloat(t.leave_hours || 0);
      const tot = parseFloat(t.total_payable_hours || reg + ot + lv);
      regular += reg;
      overtime += ot;
      leave += lv;
      totalPayable += tot;
    });

    return {
      staffCount: timesheets.length,
      regular: regular.toFixed(1),
      overtime: overtime.toFixed(1),
      leave: leave.toFixed(1),
      totalPayable: totalPayable.toFixed(1),
    };
  }, [timesheets]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '3rem', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(59, 130, 246, 0.05) 100%)',
          padding: '1.5rem',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.5rem' }}>👥</span>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Workforce Operations & Scheduling
            </h1>
            <Badge status="success">Operations Hub</Badge>
          </div>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Operations Manager command center: Live attendance, time tracking, leave approvals, maker-checker punch corrections, and payroll timesheets.
          </p>
        </div>

        {/* Global Controls / Property Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <select
              className="input-field"
              value={filterPropertyId}
              onChange={(e) => setFilterPropertyId(e.target.value)}
              style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
            >
              <option value="all">All Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (activeTab === 'attendance') fetchAttendance();
              if (activeTab === 'leave') fetchLeaveRequests();
              if (activeTab === 'timesheets') fetchTimesheets();
              if (activeTab === 'swaps') fetchSwaps();
            }}
            title="Refresh current view"
          >
            <RefreshCw size={14} style={{ marginRight: '0.35rem' }} /> Refresh
          </Button>
        </div>
      </div>

      {/* Primary Tab Navigation (Responsive Horizontal Scroll) */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '0.25rem',
          overflowX: 'auto',
          maxWidth: '100%',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <button
          onClick={() => setActiveTab('roster')}
          style={{
            padding: '0.65rem 1.25rem',
            background: activeTab === 'roster' ? 'var(--bg-card)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'roster' ? '3px solid #10b981' : '3px solid transparent',
            color: activeTab === 'roster' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'roster' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <Calendar size={16} /> Roster Planning & Shifts
        </button>

        <button
          onClick={() => setActiveTab('attendance')}
          style={{
            padding: '0.65rem 1.25rem',
            background: activeTab === 'attendance' ? 'var(--bg-card)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'attendance' ? '3px solid #10b981' : '3px solid transparent',
            color: activeTab === 'attendance' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'attendance' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <Clock size={16} /> Live Attendance & Punches
          {corrections.length > 0 && (
            <span
              style={{
                background: '#ef4444',
                color: '#fff',
                fontSize: '0.7rem',
                padding: '2px 6px',
                borderRadius: '10px',
                fontWeight: 700,
              }}
            >
              {corrections.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('leave')}
          style={{
            padding: '0.65rem 1.25rem',
            background: activeTab === 'leave' ? 'var(--bg-card)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'leave' ? '3px solid #10b981' : '3px solid transparent',
            color: activeTab === 'leave' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'leave' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <Calendar size={16} /> Leave Management
          {leaveRequests.filter((l) => ['PENDING', 'PENDING_MANAGER', 'PENDING_ADMIN'].includes(l.status)).length > 0 && (
            <span
              style={{
                background: '#f59e0b',
                color: '#fff',
                fontSize: '0.7rem',
                padding: '2px 6px',
                borderRadius: '10px',
                fontWeight: 700,
              }}
            >
              {leaveRequests.filter((l) => ['PENDING', 'PENDING_MANAGER', 'PENDING_ADMIN'].includes(l.status)).length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('timesheets')}
          style={{
            padding: '0.65rem 1.25rem',
            background: activeTab === 'timesheets' ? 'var(--bg-card)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'timesheets' ? '3px solid #10b981' : '3px solid transparent',
            color: activeTab === 'timesheets' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'timesheets' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <Download size={16} /> Payroll Timesheets
        </button>

        <button
          onClick={() => setActiveTab('swaps')}
          style={{
            padding: '0.65rem 1.25rem',
            background: activeTab === 'swaps' ? 'var(--bg-card)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'swaps' ? '3px solid #10b981' : '3px solid transparent',
            color: activeTab === 'swaps' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'swaps' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <User size={16} /> Shift Swaps
          {swaps.filter((s) => s.status === 'PENDING').length > 0 && (
            <span
              style={{
                background: '#3b82f6',
                color: '#fff',
                fontSize: '0.7rem',
                padding: '2px 6px',
                borderRadius: '10px',
                fontWeight: 700,
              }}
            >
              {swaps.filter((s) => s.status === 'PENDING').length}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 0: ROSTER PLANNING & SHIFT ASSIGNMENT GRID                            */}
      {/* ========================================================================= */}
      {activeTab === 'roster' && (
        <RosterGrid activePropertyId={filterPropertyId} />
      )}

      {/* ========================================================================= */}
      {/* TAB 1: LIVE ATTENDANCE & PUNCH CORRECTIONS                               */}
      {/* ========================================================================= */}
      {activeTab === 'attendance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Quick Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <Card style={{ padding: '1rem', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL LOGGED TODAY</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {attendanceStats.total}
              </div>
            </Card>

            <Card style={{ padding: '1rem', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>ON DUTY NOW</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
                {attendanceStats.onDuty}
              </div>
            </Card>

            <Card style={{ padding: '1rem', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>ON BREAK</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f59e0b', marginTop: '0.25rem' }}>
                {attendanceStats.onBreak}
              </div>
            </Card>

            <Card style={{ padding: '1rem', borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>LATE ARRIVALS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#ef4444', marginTop: '0.25rem' }}>
                {attendanceStats.lateArrivals}
              </div>
            </Card>

            <Card style={{ padding: '1rem', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>LOCATION EXCEPTIONS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: attendanceStats.locationExceptions > 0 ? '#8b5cf6' : 'var(--text-primary)', marginTop: '0.25rem' }}>
                {attendanceStats.locationExceptions}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                {attendanceStats.locationExceptions > 0 ? 'Requires Manager Review' : 'All Punches Cleared'}
              </div>
            </Card>
          </div>

          {/* Pending Punch Corrections Queue */}
          {corrections.length > 0 && (
            <Card
              style={{
                border: '1px solid #f87171',
                background: 'rgba(239, 68, 68, 0.04)',
                padding: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertTriangle size={18} color="#ef4444" />
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#ef4444' }}>
                    Pending Punch Corrections Queue ({corrections.length})
                  </h3>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  🛡️ Maker-Checker Enforced: Employees and Managers cannot approve their own corrections.
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem' }}>Staff Member</th>
                      <th style={{ padding: '0.5rem' }}>Date</th>
                      <th style={{ padding: '0.5rem' }}>Type</th>
                      <th style={{ padding: '0.5rem' }}>Requested Times</th>
                      <th style={{ padding: '0.5rem' }}>Explanation</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Review Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {corrections.map((corr) => {
                      const isOwn = corr.user_id === user?.id || corr.created_by === user?.id;
                      return (
                        <tr key={corr.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.5rem', fontWeight: 600 }}>
                            {corr.employee_name || `Employee #${corr.employee_id}`}
                          </td>
                          <td style={{ padding: '0.5rem' }}>{corr.shift_date || corr.attendance_date}</td>
                          <td style={{ padding: '0.5rem' }}>
                            <Badge status="neutral">{corr.correction_type || 'CLOCK_IN'}</Badge>
                          </td>
                          <td style={{ padding: '0.5rem' }}>
                            In: {corr.corrected_clock_in ? new Date(corr.corrected_clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'} |{' '}
                            Out: {corr.corrected_clock_out ? new Date(corr.corrected_clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                          </td>
                          <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{corr.reason || '-'}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                            {isOwn ? (
                              <span style={{ fontSize: '0.75rem', color: '#ef4444', fontStyle: 'italic' }}>
                                Self-Review Blocked
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => setReviewCorrectionModal(corr)}
                              >
                                Review
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Daily Attendance Ledger (DEF-B05: Decoupled Punctuality, Location Verification & Review Status) */}
          <Card style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Daily Attendance Ledger
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Independent tracking of schedule punctuality, GPS geofence verification, and manager exception reviews.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Date:</span>
                <input
                  type="date"
                  className="input-field"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                />

                {isManagement && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setIsManualPunchOpen(true)}
                      style={{ fontSize: '0.78rem' }}
                    >
                      + Record Manual Punch
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsPolicyModalOpen(true)}
                      style={{ fontSize: '0.78rem' }}
                    >
                      ⚙ Attendance Policy
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsKioskModalOpen(true)}
                      style={{ fontSize: '0.78rem' }}
                    >
                      📱 Kiosk Terminals
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                Loading attendance records...
              </div>
            ) : attendanceRecords.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                <Clock size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                <p style={{ margin: 0, fontWeight: 500 }}>No attendance records found for this date.</p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>Staff members clock in via My Schedule / Self-Service portal.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', minWidth: '860px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.65rem' }}>Staff Member</th>
                      <th style={{ padding: '0.65rem' }}>Property</th>
                      <th style={{ padding: '0.65rem' }}>Punctuality</th>
                      <th style={{ padding: '0.65rem' }}>Clock In / Out</th>
                      <th style={{ padding: '0.65rem' }}>Location Verification</th>
                      <th style={{ padding: '0.65rem' }}>Review Status</th>
                      <th style={{ padding: '0.65rem' }}>Hours</th>
                      {isManagement && <th style={{ padding: '0.65rem', textAlign: 'right' }}>Review Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceRecords.map((att) => {
                      const rawIn = att.clock_in || att.clock_in_time;
                      const rawOut = att.clock_out || att.clock_out_time;
                      const clockInTime = rawIn ? new Date(rawIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
                      const clockOutTime = rawOut ? new Date(rawOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
                      const hours = att.total_hours || att.actual_hours ? `${parseFloat(att.total_hours || att.actual_hours).toFixed(2)}h` : (rawIn && !rawOut ? 'In Progress' : '-');
                      const isLate = att.attendance_status === 'LATE' || att.is_late;
                      const hasGps = Boolean(att.clock_in_lat || att.location_lat || att.clock_in_lng || att.location_lng);
                      const needsReview = att.requires_review === 1 || (att.is_verified === 0 && !att.verified_by_id);
                      const isOwn = isOwnPunch(att);

                      return (
                        <tr key={att.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.65rem', fontWeight: 600 }}>
                            <div>{att.employee_name || `Employee #${att.employee_id}`}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {att.department || att.job_title || 'Staff'}
                            </div>
                          </td>

                          <td style={{ padding: '0.65rem', color: 'var(--text-secondary)' }}>
                            {att.property_name || 'Assigned Property'}
                          </td>

                          {/* Punctuality (Strictly schedule vs clock_in, decoupled from location) */}
                          <td style={{ padding: '0.65rem' }}>
                            {isLate ? (
                              <Badge status="error">Late</Badge>
                            ) : att.attendance_status === 'HALF_DAY' ? (
                              <Badge status="warning">Half Day</Badge>
                            ) : att.attendance_status === 'EARLY_DEPARTURE' ? (
                              <Badge status="warning">Early Departure</Badge>
                            ) : att.attendance_status === 'ABSENT' ? (
                              <Badge status="error">Absent</Badge>
                            ) : att.attendance_status === 'ON_LEAVE' ? (
                              <Badge status="info">On Leave</Badge>
                            ) : rawIn ? (
                              <Badge status="success">On Time</Badge>
                            ) : (
                              <Badge status="neutral">Scheduled</Badge>
                            )}
                          </td>

                          {/* Clock In / Out Times */}
                          <td style={{ padding: '0.65rem' }}>
                            <div style={{ fontSize: '0.82rem' }}>In: <strong>{clockInTime}</strong></div>
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Out: {clockOutTime}</div>
                          </td>

                          {/* Location Verification (Decoupled from Punctuality) */}
                          <td style={{ padding: '0.65rem' }}>
                            {!hasGps ? (
                              <Badge status="neutral">GPS Unavailable</Badge>
                            ) : att.is_verified === 1 ? (
                              <Badge status="success">📍 Location Verified</Badge>
                            ) : (
                              <div>
                                <Badge status="error">⚠️ Verification Failed</Badge>
                                {att.verification_notes && (
                                  <div
                                    style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                    title={att.verification_notes}
                                  >
                                    {att.verification_notes.includes('Distance')
                                      ? att.verification_notes.match(/Distance ~[\d.]+m exceeds radius \d+m/)?.[0] || 'Outside perimeter'
                                      : 'Outside geofence'}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Review Status */}
                          <td style={{ padding: '0.65rem' }}>
                            {needsReview ? (
                              <Badge status="warning">Requires Review</Badge>
                            ) : att.verified_by_id || att.verified_at ? (
                              <div>
                                <Badge status={att.is_verified === 1 ? 'success' : 'error'}>
                                  {att.is_verified === 1 ? 'Reviewed (Approved)' : 'Reviewed (Rejected)'}
                                </Badge>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  by {att.verified_by_name || 'Manager'}
                                </div>
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Verified at punch</span>
                            )}
                          </td>

                          <td style={{ padding: '0.65rem', fontWeight: 600 }}>{hours}</td>

                          {/* Review Action (Management Only, with Maker-Checker Guard) */}
                          {isManagement && (
                            <td style={{ padding: '0.65rem', textAlign: 'right' }}>
                              {needsReview ? (
                                isOwn ? (
                                  <span style={{ fontSize: '0.72rem', color: '#ef4444', fontStyle: 'italic', fontWeight: 600 }}>
                                    Self-Review Blocked (Maker-Checker)
                                  </span>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleOpenReviewAttendanceModal(att)}
                                    style={{ fontSize: '0.74rem', padding: '0.2rem 0.5rem', minHeight: '32px' }}
                                  >
                                    Review Exception
                                  </Button>
                                )
                              ) : (
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                  {att.verified_by_id ? 'Resolved' : '-'}
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: LEAVE MANAGEMENT & APPROVALS                                      */}
      {/* ========================================================================= */}
      {activeTab === 'leave' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Subtab Navigation */}
          <div style={{ display: 'flex', gap: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setLeaveSubTab('queue')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: leaveSubTab === 'queue' ? 'var(--primary-color, #2563eb)' : 'var(--bg-surface, #f3f4f6)',
                color: leaveSubTab === 'queue' ? '#fff' : 'var(--text-primary)',
                fontWeight: leaveSubTab === 'queue' ? 700 : 500,
                cursor: 'pointer',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              Approval Queue & Balances
              {leaveRequests.filter((r) => ['PENDING', 'PENDING_MANAGER', 'PENDING_ADMIN'].includes(r.status)).length > 0 && (
                <span
                  style={{
                    background: leaveSubTab === 'queue' ? 'rgba(255,255,255,0.3)' : '#2563eb',
                    color: '#fff',
                    fontSize: '0.7rem',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    fontWeight: 700,
                  }}
                >
                  {leaveRequests.filter((r) => ['PENDING', 'PENDING_MANAGER', 'PENDING_ADMIN'].includes(r.status)).length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setLeaveSubTab('calendar')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: leaveSubTab === 'calendar' ? 'var(--primary-color, #2563eb)' : 'var(--bg-surface, #f3f4f6)',
                color: leaveSubTab === 'calendar' ? '#fff' : 'var(--text-primary)',
                fontWeight: leaveSubTab === 'calendar' ? 700 : 500,
                cursor: 'pointer',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Calendar size={15} /> Team Absence Calendar
            </button>
          </div>

          {leaveSubTab === 'calendar' ? (
            <AbsenceCalendar leaveRequests={leaveRequests} isManager={true} />
          ) : (
            <>
              {/* Pending Leave Requests */}
              <Card style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Leave Approval Queue
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Review staff time-off requests. Approving a leave automatically cancels conflicting scheduled shifts.
                    </p>
                  </div>

                  <Badge status="info">Maker-Checker Guard Enforced</Badge>
                </div>

                {loading ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    Loading leave requests...
                  </div>
                ) : leaveRequests.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    <Calendar size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontWeight: 500 }}>No leave applications submitted.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '0.65rem' }}>Staff Member</th>
                          <th style={{ padding: '0.65rem' }}>Category</th>
                          <th style={{ padding: '0.65rem' }}>Dates</th>
                          <th style={{ padding: '0.65rem' }}>Days</th>
                          <th style={{ padding: '0.65rem' }}>Reason & Docs</th>
                          <th style={{ padding: '0.65rem' }}>Routing / Status</th>
                          <th style={{ padding: '0.65rem', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaveRequests.map((req) => {
                          const isOwn = isOwnLeave(req);
                          const isPending = ['PENDING', 'PENDING_MANAGER', 'PENDING_ADMIN'].includes(req.status);
                          return (
                            <tr key={req.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '0.65rem', fontWeight: 600 }}>
                                <div>{req.employee_name || `Employee #${req.employee_id}`}</div>
                                {req.request_code && (
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                    {req.request_code}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '0.65rem' }}>
                                <Badge status="neutral">{req.category_name || req.leave_category || 'ANNUAL'}</Badge>
                              </td>
                              <td style={{ padding: '0.65rem' }}>
                                <div>{req.start_date} to {req.end_date}</div>
                              </td>
                              <td style={{ padding: '0.65rem', fontWeight: 600 }}>
                                {req.total_days || 1} day{req.total_days === 1 ? '' : 's'}
                              </td>
                              <td style={{ padding: '0.65rem', color: 'var(--text-secondary)' }}>
                                <div>{req.reason || '-'}</div>
                                {req.document_url && (
                                  <a
                                    href={req.document_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ fontSize: '0.72rem', color: '#2563eb', textDecoration: 'underline', marginTop: '2px', display: 'inline-block' }}
                                  >
                                    📎 Attached Document
                                  </a>
                                )}
                              </td>
                              <td style={{ padding: '0.65rem' }}>
                                {req.status === 'APPROVED' ? (
                                  <Badge status="success">Approved</Badge>
                                ) : req.status === 'REJECTED' ? (
                                  <Badge status="error">Rejected</Badge>
                                ) : req.status === 'PENDING_ADMIN' ? (
                                  <Badge status="warning">Pending Admin</Badge>
                                ) : req.status === 'PENDING_MANAGER' ? (
                                  <Badge status="warning">Pending Manager</Badge>
                                ) : req.status === 'CANCELLED' ? (
                                  <Badge status="neutral">Cancelled</Badge>
                                ) : (
                                  <Badge status="warning">{req.status}</Badge>
                                )}
                              </td>
                              <td style={{ padding: '0.65rem', textAlign: 'right' }}>
                                {isPending ? (
                                  isOwn ? (
                                    <span style={{ fontSize: '0.75rem', color: '#ef4444', fontStyle: 'italic', fontWeight: 600 }}>
                                      Self-Approval Blocked
                                    </span>
                                  ) : req.status === 'PENDING_ADMIN' && !isAdmin ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                      <span style={{ fontSize: '0.72rem', color: '#6366f1', fontWeight: 600 }}>Awaiting Admin</span>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleOpenReviewLeave(req)}
                                        style={{ fontSize: '0.72rem', padding: '2px 6px' }}
                                      >
                                        View
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="primary"
                                      onClick={() => handleOpenReviewLeave(req)}
                                    >
                                      Review
                                    </Button>
                                  )
                                ) : (
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {req.reviewed_by ? 'Resolved' : 'Completed'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* Leave Entitlement Balances Overview (Authoritative backend columns) */}
              <Card style={{ padding: '1.25rem' }}>
                <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Staff Leave Balances & Entitlements
                </h3>
                <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Authoritative annual, sick, maternity, paternity, and compassionate leave allotments.
                </p>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.65rem' }}>Staff Member</th>
                        <th style={{ padding: '0.65rem' }}>Leave Category</th>
                        <th style={{ padding: '0.65rem' }}>Total Allocated</th>
                        <th style={{ padding: '0.65rem' }}>Used Days</th>
                        <th style={{ padding: '0.65rem' }}>Pending Days</th>
                        <th style={{ padding: '0.65rem' }}>Remaining Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaveBalances.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                            No balance records found.
                          </td>
                        </tr>
                      ) : (
                        leaveBalances.map((bal, idx) => {
                          const total = bal.total_allocated ?? bal.entitlement_days ?? 0;
                          const used = bal.used_days ?? 0;
                          const pending = bal.pending_days ?? 0;
                          const remaining = bal.remaining_days ?? Math.max(0, total - used);
                          return (
                            <tr key={bal.id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '0.65rem', fontWeight: 600 }}>
                                {bal.employee_name || `Employee #${bal.employee_id}`}
                              </td>
                              <td style={{ padding: '0.65rem' }}>{bal.category_name || bal.leave_type || 'Annual Leave'}</td>
                              <td style={{ padding: '0.65rem' }}>{total} days</td>
                              <td style={{ padding: '0.65rem', color: '#ef4444' }}>{used} days</td>
                              <td style={{ padding: '0.65rem', color: '#f59e0b' }}>{pending} days</td>
                              <td style={{ padding: '0.65rem', fontWeight: 700, color: remaining > 0 ? '#10b981' : '#ef4444' }}>
                                {remaining} days
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PAYROLL-READY TIMESHEETS                                          */}
      {/* ========================================================================= */}
      {activeTab === 'timesheets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Timesheet Summary Metrics Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <Card style={{ padding: '1rem', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>STAFF RECORDED</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {timesheetTotals.staffCount}
              </div>
            </Card>

            <Card style={{ padding: '1rem', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>REGULAR HOURS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
                {timesheetTotals.regular}h
              </div>
            </Card>

            <Card style={{ padding: '1rem', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>OVERTIME HOURS (&gt;40H)</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f59e0b', marginTop: '0.25rem' }}>
                {timesheetTotals.overtime}h
              </div>
            </Card>

            <Card style={{ padding: '1rem', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>PAID LEAVE HOURS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#8b5cf6', marginTop: '0.25rem' }}>
                {timesheetTotals.leave}h
              </div>
            </Card>

            <Card style={{ padding: '1rem', borderLeft: '4px solid #06b6d4' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL PAYABLE HOURS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#06b6d4', marginTop: '0.25rem' }}>
                {timesheetTotals.totalPayable}h
              </div>
            </Card>
          </div>

          {/* Timesheet Filter Bar & Table */}
          <Card style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Payroll-Ready Timesheets
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Aggregated work hours, break deductions, overtime calculations, and exportable CSV.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>From:</span>
                  <input
                    type="date"
                    className="input-field"
                    value={timesheetStart}
                    onChange={(e) => setTimesheetStart(e.target.value)}
                    style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>To:</span>
                  <input
                    type="date"
                    className="input-field"
                    value={timesheetEnd}
                    onChange={(e) => setTimesheetEnd(e.target.value)}
                    style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                  />
                </div>

                <Button variant="primary" size="sm" onClick={handleExportCsv} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Download size={14} /> Export CSV
                </Button>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                Aggregating timesheet records...
              </div>
            ) : timesheets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                <Download size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                <p style={{ margin: 0, fontWeight: 500 }}>No timesheet records found for this period.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.65rem' }}>Employee</th>
                      <th style={{ padding: '0.65rem' }}>Role / Dept</th>
                      <th style={{ padding: '0.65rem' }}>Property</th>
                      <th style={{ padding: '0.65rem' }}>Shifts Worked</th>
                      <th style={{ padding: '0.65rem' }}>Regular Hours</th>
                      <th style={{ padding: '0.65rem' }}>Overtime Hours</th>
                      <th style={{ padding: '0.65rem' }}>Paid Leave</th>
                      <th style={{ padding: '0.65rem', fontWeight: 700 }}>Total Payable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timesheets.map((t, idx) => (
                      <tr key={t.employee_id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.65rem', fontWeight: 600 }}>
                          {t.employee_name || `Employee #${t.employee_id}`}
                        </td>
                        <td style={{ padding: '0.65rem' }}>{t.role || 'Staff'}</td>
                        <td style={{ padding: '0.65rem', color: 'var(--text-secondary)' }}>
                          {t.property_name || 'Assigned Property'}
                        </td>
                        <td style={{ padding: '0.65rem' }}>{t.shifts_count || t.total_shifts || 0}</td>
                        <td style={{ padding: '0.65rem' }}>{parseFloat(t.regular_hours || t.actual_hours || 0).toFixed(2)}h</td>
                        <td style={{ padding: '0.65rem', color: parseFloat(t.overtime_hours || 0) > 0 ? '#f59e0b' : 'inherit' }}>
                          {parseFloat(t.overtime_hours || 0).toFixed(2)}h
                        </td>
                        <td style={{ padding: '0.65rem' }}>{parseFloat(t.leave_hours || 0).toFixed(2)}h</td>
                        <td style={{ padding: '0.65rem', fontWeight: 700, color: '#10b981' }}>
                          {parseFloat(t.total_payable_hours || 0).toFixed(2)}h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: SHIFT SWAPS                                                       */}
      {/* ========================================================================= */}
      {activeTab === 'swaps' && (
        <Card style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Shift Swap Requests
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Review peer shift swaps. Approval automatically reassigns the scheduled shift to the target staff member.
              </p>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              Loading swap requests...
            </div>
          ) : swaps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
              <User size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
              <p style={{ margin: 0, fontWeight: 500 }}>No shift swap requests at this time.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.65rem' }}>Requesting Staff</th>
                    <th style={{ padding: '0.65rem' }}>Target Staff</th>
                    <th style={{ padding: '0.65rem' }}>Shift Date</th>
                    <th style={{ padding: '0.65rem' }}>Reason</th>
                    <th style={{ padding: '0.65rem' }}>Status</th>
                    <th style={{ padding: '0.65rem', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {swaps.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.65rem', fontWeight: 600 }}>
                        {s.requesting_employee_name || `Employee #${s.requesting_employee_id}`}
                      </td>
                      <td style={{ padding: '0.65rem' }}>
                        {s.target_employee_name || `Employee #${s.target_employee_id}`}
                      </td>
                      <td style={{ padding: '0.65rem' }}>{s.shift_date || 'Upcoming Shift'}</td>
                      <td style={{ padding: '0.65rem', color: 'var(--text-secondary)' }}>{s.reason || '-'}</td>
                      <td style={{ padding: '0.65rem' }}>
                        <Badge
                          status={
                            s.status === 'APPROVED'
                              ? 'success'
                              : s.status === 'REJECTED'
                              ? 'error'
                              : 'warning'
                          }
                        >
                          {s.status}
                        </Badge>
                      </td>
                      <td style={{ padding: '0.65rem', textAlign: 'right' }}>
                        {s.status === 'PENDING' ? (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              setReviewSwapModal(s);
                              setSwapReviewStatus('APPROVED');
                              setSwapReviewNote('');
                            }}
                          >
                            Review
                          </Button>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Reviewed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REVIEW PUNCH CORRECTION                                           */}
      {/* ========================================================================= */}
      <Modal
        isOpen={!!reviewCorrectionModal}
        onClose={() => setReviewCorrectionModal(null)}
        title="Review Attendance Correction Request"
      >
        {reviewCorrectionModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
              <div><strong>Staff:</strong> {reviewCorrectionModal.employee_name || `Employee #${reviewCorrectionModal.employee_id}`}</div>
              <div><strong>Date:</strong> {reviewCorrectionModal.shift_date || reviewCorrectionModal.attendance_date}</div>
              <div><strong>Type:</strong> {reviewCorrectionModal.correction_type}</div>
              <div><strong>Reason:</strong> {reviewCorrectionModal.reason}</div>
            </div>

            <div>
              <label className="form-label">Manager Decision Notes</label>
              <textarea
                className="input-field"
                rows={2}
                placeholder="Optional explanation for decision..."
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Button variant="ghost" onClick={() => setReviewCorrectionModal(null)}>
                Cancel
              </Button>
              <Button variant="outline" onClick={() => handleReviewCorrection('REJECTED')}>
                Reject
              </Button>
              <Button variant="primary" onClick={() => handleReviewCorrection('APPROVED')}>
                Approve & Update Punch
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: REVIEW LEAVE REQUEST (DEF-B10 & DELEGATION POLICY)                 */}
      {/* ========================================================================= */}
      <Modal
        isOpen={!!reviewLeaveModal}
        onClose={() => setReviewLeaveModal(null)}
        title="Review Staff Leave Application"
        subtitle="Maker-checker protected managerial review and delegation threshold enforcement"
      >
        {reviewLeaveModal && (() => {
          const totalDays = Number(reviewLeaveModal.total_days || 1);
          const exceedsLimit = !isAdmin && totalDays > 14;
          const isPendingAdmin = reviewLeaveModal.status === 'PENDING_ADMIN';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  background: 'var(--bg-surface)',
                  padding: '0.85rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                }}
              >
                <div><strong>Staff Member:</strong> {reviewLeaveModal.employee_name || `Employee #${reviewLeaveModal.employee_id}`}</div>
                <div><strong>Category:</strong> {reviewLeaveModal.category_name || reviewLeaveModal.leave_category || 'Annual Leave'}</div>
                <div><strong>Leave Period:</strong> {reviewLeaveModal.start_date} to {reviewLeaveModal.end_date} (<strong>{totalDays}</strong> calendar day{totalDays === 1 ? '' : 's'})</div>
                <div><strong>Reason:</strong> {reviewLeaveModal.reason || 'None provided'}</div>
                {reviewLeaveModal.document_url && (
                  <div>
                    <strong>Supporting Document:</strong>{' '}
                    <a
                      href={reviewLeaveModal.document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#2563eb', textDecoration: 'underline', wordBreak: 'break-all' }}
                    >
                      📎 View Uploaded Document
                    </a>
                  </div>
                )}
                {reviewLeaveModal.manager_notes && (
                  <div style={{ color: 'var(--text-muted)' }}>
                    <strong>Prior Reviewer Notes:</strong> {reviewLeaveModal.manager_notes}
                  </div>
                )}
              </div>

              {/* 14-day delegation threshold warning */}
              {exceedsLimit && (
                <div
                  style={{
                    background: '#fef3c7',
                    border: '1px solid #f59e0b',
                    color: '#92400e',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Delegated Authority Limit (14 Days) Exceeded:</strong>
                    <div style={{ marginTop: '2px' }}>
                      This leave request is for {totalDays} days. Operations Managers may approve leaves up to 14 days only. Please escalate this application to an Executive Administrator.
                    </div>
                  </div>
                </div>
              )}

              {/* Pending Admin notification for managers */}
              {isPendingAdmin && !isAdmin && (
                <div
                  style={{
                    background: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid #3b82f6',
                    color: '#1d4ed8',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <AlertCircle size={18} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Awaiting Executive Administrator:</strong>
                    <div style={{ marginTop: '2px' }}>
                      This request has been escalated and requires Administrator approval.
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="form-label">Review Determination *</label>
                <select
                  className="input-field"
                  value={leaveReviewStatus}
                  onChange={(e) => setLeaveReviewStatus(e.target.value)}
                >
                  <option value="APPROVED" disabled={exceedsLimit}>
                    {exceedsLimit ? 'Approve (Disabled — Exceeds 14-day delegation limit)' : 'Approve Leave (Auto-Cancel Conflicting Shifts)'}
                  </option>
                  <option value="REJECTED">Reject Leave</option>
                  <option value="ESCALATED">Escalate to Executive Administrator</option>
                </select>
              </div>

              <div>
                <label className="form-label">Review / Escalation Notes</label>
                <textarea
                  className="input-field"
                  rows={2}
                  placeholder="Notes for employee or escalation justification..."
                  value={leaveReviewNote}
                  onChange={(e) => setLeaveReviewNote(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <Button variant="ghost" onClick={() => setReviewLeaveModal(null)}>
                  Cancel
                </Button>
                {exceedsLimit ? (
                  <Button
                    variant="primary"
                    onClick={() => handleReviewLeave('ESCALATED')}
                    style={{ background: '#d97706', borderColor: '#d97706' }}
                  >
                    Escalate to Administrator
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => handleReviewLeave()}>
                    Confirm Decision
                  </Button>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: REVIEW SHIFT SWAP                                                 */}
      {/* ========================================================================= */}
      <Modal
        isOpen={!!reviewSwapModal}
        onClose={() => setReviewSwapModal(null)}
        title="Review Shift Swap Request"
      >
        {reviewSwapModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
              <div><strong>Requestor:</strong> {reviewSwapModal.requesting_employee_name}</div>
              <div><strong>Target Colleague:</strong> {reviewSwapModal.target_employee_name}</div>
              <div><strong>Shift Date:</strong> {reviewSwapModal.shift_date}</div>
              <div><strong>Reason:</strong> {reviewSwapModal.reason}</div>
            </div>

            <div>
              <label className="form-label">Decision</label>
              <select
                className="input-field"
                value={swapReviewStatus}
                onChange={(e) => setSwapReviewStatus(e.target.value)}
              >
                <option value="APPROVED">Approve (Reassign Shift to Target Staff)</option>
                <option value="REJECTED">Reject</option>
              </select>
            </div>

            <div>
              <label className="form-label">Manager Notes</label>
              <textarea
                className="input-field"
                rows={2}
                placeholder="Reason or operational notes..."
                value={swapReviewNote}
                onChange={(e) => setSwapReviewNote(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Button variant="ghost" onClick={() => setReviewSwapModal(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleReviewSwap}>
                Confirm Decision
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: REVIEW ATTENDANCE LOCATION EXCEPTION (DEF-B05)                     */}
      {/* ========================================================================= */}
      {reviewAttendanceModal && (
        <Modal
          isOpen={Boolean(reviewAttendanceModal)}
          onClose={() => setReviewAttendanceModal(null)}
          title="Review Attendance Location Exception"
          subtitle="Evaluate geofence perimeter mismatch and record managerial determination"
          size="md"
        >
          <form onSubmit={handleReviewAttendanceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              style={{
                background: 'var(--bg-surface)',
                padding: '0.85rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                fontSize: '0.82rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
              }}
            >
              <div><strong>Staff Member:</strong> {reviewAttendanceModal.employee_name || `Employee #${reviewAttendanceModal.employee_id}`}</div>
              <div><strong>Property:</strong> {reviewAttendanceModal.property_name || `Property #${reviewAttendanceModal.property_id}`}</div>
              <div><strong>Shift Date:</strong> {reviewAttendanceModal.work_date || filterDate}</div>
              <div><strong>Clock-In Time:</strong> {reviewAttendanceModal.clock_in ? new Date(reviewAttendanceModal.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</div>
              {reviewAttendanceModal.clock_in_lat && (
                <div><strong>Recorded Coordinates:</strong> {parseFloat(reviewAttendanceModal.clock_in_lat).toFixed(6)}, {parseFloat(reviewAttendanceModal.clock_in_lng).toFixed(6)}</div>
              )}
              {reviewAttendanceModal.verification_notes && (
                <div style={{ color: '#d97706', marginTop: '0.2rem' }}>
                  <strong>Exception Details:</strong> {reviewAttendanceModal.verification_notes}
                </div>
              )}
            </div>

            <div>
              <label className="input-label" style={{ fontSize: '0.8rem' }}>Managerial Determination *</label>
              <select
                className="input-field"
                value={reviewAttendanceAction}
                onChange={(e) => setReviewAttendanceAction(e.target.value)}
                required
                style={{ minHeight: '38px' }}
              >
                <option value="VERIFY">✓ Approve Exception — Mark Location as Verified</option>
                <option value="FLAG_REJECTED">✕ Reject Exception — Confirm Geofence Violation</option>
              </select>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {reviewAttendanceAction === 'VERIFY'
                  ? 'Approving overrides the perimeter exception flag and records managerial clearance.'
                  : 'Rejecting keeps the attendance punch unverified and preserves the audit exception.'}
              </div>
            </div>

            <div>
              <label className="input-label" style={{ fontSize: '0.8rem' }}>Manager Review Notes *</label>
              <textarea
                className="input-field"
                rows={3}
                placeholder="e.g. Employee was dispatched to external client meeting on arrival / Confirmed with site supervisor"
                value={reviewAttendanceNotes}
                onChange={(e) => setReviewAttendanceNotes(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
              <Button type="button" variant="secondary" onClick={() => setReviewAttendanceModal(null)} style={{ minHeight: '40px' }}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={reviewAttendanceLoading} style={{ minHeight: '40px' }}>
                Submit Determination
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* STAGE 2.2 MODALS: MANUAL PUNCH, ATTENDANCE POLICY, KIOSK TERMINALS        */}
      {/* ========================================================================= */}
      {isManualPunchOpen && (
        <ManualPunchModal
          isOpen={isManualPunchOpen}
          onClose={() => setIsManualPunchOpen(false)}
          properties={properties}
          employees={employees}
          currentUser={user}
          activePropertyId={filterPropertyId}
          onSuccess={() => {
            addToast('Manager-assisted attendance recorded successfully!', 'success');
            fetchAttendance();
          }}
        />
      )}

      {isPolicyModalOpen && (
        <AttendancePolicyModal
          isOpen={isPolicyModalOpen}
          onClose={() => setIsPolicyModalOpen(false)}
          properties={properties}
          currentUser={user}
          activePropertyId={filterPropertyId}
          onSuccess={(msg) => {
            addToast(msg || 'Attendance policy updated successfully!', 'success');
            fetchAttendance();
          }}
        />
      )}

      {isKioskModalOpen && (
        <KioskManagementModal
          isOpen={isKioskModalOpen}
          onClose={() => setIsKioskModalOpen(false)}
          properties={properties}
          currentUser={user}
          activePropertyId={filterPropertyId}
        />
      )}
    </div>
  );
}

