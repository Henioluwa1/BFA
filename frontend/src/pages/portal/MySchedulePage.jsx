import React, { useState, useEffect, useMemo } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { workforceService, employeeService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Clock,
  Calendar,
  User,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  FileText,
} from '../../components/ui/Icons';
import AbsenceCalendar from '../../components/workforce/AbsenceCalendar';

export default function MySchedulePage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      if (tabParam === 'leave' || window.location.hash === '#leave') return 'leave';
      if (tabParam === 'shifts' || window.location.hash === '#shifts') return 'shifts';
    }
    return 'attendance';
  }); // 'attendance', 'leave', 'shifts'
  const [loading, setLoading] = useState(false);

  // Live Digital Clock state
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Time Clock Status & Active Session
  const [activeSession, setActiveSession] = useState(null);
  const [clockLoading, setClockLoading] = useState(false);

  // Tab 1: Attendance History & Corrections
  const [myAttendance, setMyAttendance] = useState([]);
  const [myCorrections, setMyCorrections] = useState([]);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({
    shift_date: new Date().toISOString().split('T')[0],
    correction_type: 'CLOCK_IN',
    corrected_clock_in: '',
    corrected_clock_out: '',
    reason: '',
  });

  // Tab 2: Leave Balances & Requests
  const [myLeaveBalances, setMyLeaveBalances] = useState([]);
  const [myLeaveRequests, setMyLeaveRequests] = useState([]);
  const [leaveCategories, setLeaveCategories] = useState([]);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveSubView, setLeaveSubView] = useState('list'); // 'list' | 'calendar'
  const [leaveForm, setLeaveForm] = useState({
    leave_category_id: '',
    start_date: '',
    end_date: '',
    reason: '',
    document_url: '',
  });

  // Dynamic duration calculation
  const calculatedDays = useMemo(() => {
    if (!leaveForm.start_date || !leaveForm.end_date) return 0;
    const s = new Date(leaveForm.start_date);
    const e = new Date(leaveForm.end_date);
    if (s > e) return -1;
    return Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1);
  }, [leaveForm.start_date, leaveForm.end_date]);

  const selectedCategory = useMemo(() => {
    return leaveCategories.find((c) => String(c.id) === String(leaveForm.leave_category_id)) || null;
  }, [leaveCategories, leaveForm.leave_category_id]);

  // Tab 3: Shifts, Availability & Swaps
  const [myShifts, setMyShifts] = useState([]);
  const [colleagues, setColleagues] = useState([]);
  const [mySwaps, setMySwaps] = useState([]);
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [swapForm, setSwapForm] = useState({
    shift_id: '',
    target_employee_id: '',
    reason: '',
  });
  const [availabilityDate, setAvailabilityDate] = useState(new Date().toISOString().split('T')[0]);
  const [availabilityStatus, setAvailabilityStatus] = useState('AVAILABLE');

  // Initial Load
  useEffect(() => {
    fetchActiveAttendance();
    fetchLeaveCategories();
    fetchColleagues();
  }, []);

  useEffect(() => {
    if (activeTab === 'attendance') {
      fetchMyAttendanceHistory();
      fetchMyCorrections();
    } else if (activeTab === 'leave') {
      fetchMyLeaveData();
    } else if (activeTab === 'shifts') {
      fetchMyShifts();
      fetchMySwaps();
    }
  }, [activeTab]);

  const fetchActiveAttendance = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await workforceService.getAttendance({ date: today, employeeId: user?.employee_id || user?.id });
      const records = res?.data || res || [];
      // Find today's uncompleted session or latest session
      const active = records.find((r) => (r.clock_in || r.clock_in_time) && !(r.clock_out || r.clock_out_time));
      setActiveSession(active || null);
    } catch (err) {
      console.error('Error fetching active attendance session:', err);
    }
  };

  const fetchMyAttendanceHistory = async () => {
    setLoading(true);
    try {
      const res = await workforceService.getAttendance();
      const records = res?.data || res || [];
      setMyAttendance(records);
    } catch (err) {
      addToast(`Error loading attendance history: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchMyCorrections = async () => {
    try {
      const res = await workforceService.getCorrections();
      setMyCorrections(res?.data || res || []);
    } catch (err) {
      console.error('Error loading corrections:', err);
    }
  };

  const fetchLeaveCategories = async () => {
    try {
      const res = await workforceService.getLeaveCategories();
      const cats = res?.data || res || [];
      setLeaveCategories(cats);
      if (cats.length > 0) {
        setLeaveForm((prev) => ({
          ...prev,
          leave_category_id: prev.leave_category_id || cats[0].id,
        }));
      }
    } catch (err) {
      console.error('Error loading leave categories:', err);
    }
  };

  const fetchMyLeaveData = async () => {
    setLoading(true);
    try {
      const [balRes, reqRes] = await Promise.all([
        workforceService.getLeaveBalances(),
        workforceService.getLeaveRequests(),
      ]);
      setMyLeaveBalances(balRes?.data || balRes || []);
      setMyLeaveRequests(reqRes?.data || reqRes || []);
    } catch (err) {
      addToast(`Error loading leave records: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchColleagues = async () => {
    try {
      const res = await employeeService.getAll();
      const emps = res?.data || res || [];
      setColleagues(emps.filter((e) => e.user_id !== user?.id));
    } catch (err) {
      console.error('Error loading colleagues:', err);
    }
  };

  const fetchMyShifts = async () => {
    setLoading(true);
    try {
      const res = await workforceService.getShifts();
      setMyShifts(res?.data || res || []);
    } catch (err) {
      console.error('Error loading shifts:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMySwaps = async () => {
    try {
      const res = await workforceService.getSwaps();
      setMySwaps(res?.data || res || []);
    } catch (err) {
      console.error('Error loading swaps:', err);
    }
  };

  // =========================================================================
  // TIME CLOCK ACTIONS (GEOLOCATED)
  // =========================================================================
  const getCoordinates = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        return resolve(null);
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000 }
      );
    });
  };

  const handleClockIn = async () => {
    setClockLoading(true);
    try {
      const coords = await getCoordinates();
      const payload = {
        property_id: user?.property_id || null,
        latitude: coords?.latitude || null,
        longitude: coords?.longitude || null,
      };
      await workforceService.clockIn(payload);
      addToast('Clock-in recorded successfully! Have a great shift.', 'success');
      await fetchActiveAttendance();
      fetchMyAttendanceHistory();
    } catch (err) {
      addToast(`Clock-in failed: ${err.message}`, 'error');
    } finally {
      setClockLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!window.confirm('Are you sure you want to clock out and end your shift?')) return;
    setClockLoading(true);
    try {
      const coords = await getCoordinates();
      const payload = {
        latitude: coords?.latitude || null,
        longitude: coords?.longitude || null,
      };
      await workforceService.clockOut(payload);
      addToast('Clock-out recorded. Shift summary saved to timesheet.', 'success');
      setActiveSession(null);
      await fetchActiveAttendance();
      fetchMyAttendanceHistory();
    } catch (err) {
      addToast(`Clock-out failed: ${err.message}`, 'error');
    } finally {
      setClockLoading(false);
    }
  };

  const handleToggleBreak = async () => {
    setClockLoading(true);
    try {
      if (activeSession?.on_break) {
        await workforceService.endBreak();
        addToast('Break ended. Resumed on-duty status.', 'success');
      } else {
        await workforceService.startBreak();
        addToast('Break started. Enjoy your rest.', 'info');
      }
      await fetchActiveAttendance();
      fetchMyAttendanceHistory();
    } catch (err) {
      addToast(`Break action failed: ${err.message}`, 'error');
    } finally {
      setClockLoading(false);
    }
  };

  // Submit Missed Punch Correction
  const handleSubmitCorrection = async (e) => {
    e.preventDefault();
    try {
      await workforceService.requestCorrection(correctionForm);
      addToast('Correction submitted for Manager maker-checker review!', 'success');
      setIsCorrectionModalOpen(false);
      setCorrectionForm({
        shift_date: new Date().toISOString().split('T')[0],
        correction_type: 'CLOCK_IN',
        corrected_clock_in: '',
        corrected_clock_out: '',
        reason: '',
      });
      fetchMyCorrections();
    } catch (err) {
      addToast(`Submission failed: ${err.message}`, 'error');
    }
  };

  // Submit Leave Request (Resolves DEF-B09: Correct contract mapping)
  const handleSubmitLeave = async (e) => {
    e.preventDefault();
    if (!leaveForm.leave_category_id) {
      addToast('Please select a leave category.', 'warning');
      return;
    }
    if (calculatedDays <= 0) {
      addToast('Start date cannot be after end date.', 'warning');
      return;
    }
    if (selectedCategory?.requires_document && !leaveForm.document_url?.trim()) {
      addToast(`Official medical documentation or certificate is required for ${selectedCategory.name}.`, 'warning');
      return;
    }

    try {
      const payload = {
        leave_category_id: parseInt(leaveForm.leave_category_id, 10),
        start_date: leaveForm.start_date,
        end_date: leaveForm.end_date,
        reason: leaveForm.reason,
        document_url: leaveForm.document_url?.trim() || null,
      };

      await workforceService.submitLeave(payload);
      addToast('Leave application submitted successfully!', 'success');
      setIsLeaveModalOpen(false);
      setLeaveForm({
        leave_category_id: leaveCategories[0]?.id || '',
        start_date: '',
        end_date: '',
        reason: '',
        document_url: '',
      });
      fetchMyLeaveData();
    } catch (err) {
      const errorMsg = err?.response?.data?.error?.message || err?.response?.data?.message || err.message;
      addToast(`Leave submission failed: ${errorMsg}`, 'error');
    }
  };

  // Submit Shift Swap Request
  const handleSubmitSwap = async (e) => {
    e.preventDefault();
    try {
      await workforceService.requestSwap(swapForm);
      addToast('Shift swap request sent for Manager review!', 'success');
      setIsSwapModalOpen(false);
      setSwapForm({ shift_id: '', target_employee_id: '', reason: '' });
      fetchMySwaps();
    } catch (err) {
      addToast(`Swap submission failed: ${err.message}`, 'error');
    }
  };

  // Submit Availability
  const handleSaveAvailability = async () => {
    try {
      await workforceService.submitAvailability({
        availability_date: availabilityDate,
        status: availabilityStatus,
      });
      addToast('Availability preference saved!', 'success');
    } catch (err) {
      addToast(`Failed to save availability: ${err.message}`, 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '3rem' }}>
      {/* Hero Time Clock Widget */}
      <Card
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#fff',
          padding: '2rem',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem' }}>⏱️</span>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#f8fafc' }}>
                Employee Time Clock
              </h2>
              {activeSession ? (
                activeSession.on_break ? (
                  <span style={{ background: '#f59e0b', color: '#000', fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px', borderRadius: '12px' }}>
                    ON BREAK
                  </span>
                ) : (
                  <span style={{ background: '#10b981', color: '#fff', fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
                    ON DUTY
                  </span>
                )
              ) : (
                <span style={{ background: '#64748b', color: '#fff', fontSize: '0.75rem', fontWeight: 600, padding: '3px 8px', borderRadius: '12px' }}>
                  OFF DUTY
                </span>
              )}
            </div>

            <div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'monospace', color: '#38bdf8', letterSpacing: '2px' }}>
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              {currentTime.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>

            {activeSession && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                Clocked in at:{' '}
                <strong style={{ color: '#fff' }}>
                  {new Date(activeSession.clock_in || activeSession.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </strong>
                {activeSession.attendance_status === 'LATE' || activeSession.is_late ? (
                  <span style={{ color: '#ef4444', marginLeft: '0.5rem', fontWeight: 700 }}>
                    (Late Arrival)
                  </span>
                ) : (
                  <span style={{ color: '#10b981', marginLeft: '0.5rem', fontWeight: 600 }}>
                    (On Time)
                  </span>
                )}
                {activeSession.requires_review === 1 || (activeSession.is_verified === 0 && !activeSession.verified_by_id) ? (
                  <span style={{ color: '#f59e0b', marginLeft: '0.5rem', fontWeight: 600 }}>
                    [Location Pending Review]
                  </span>
                ) : activeSession.is_verified === 1 ? (
                  <span style={{ color: '#38bdf8', marginLeft: '0.5rem', fontWeight: 600 }}>
                    [Location Verified]
                  </span>
                ) : null}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {!activeSession ? (
              <button
                onClick={handleClockIn}
                disabled={clockLoading}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '1rem 2rem',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)',
                }}
              >
                <Clock size={20} /> {clockLoading ? 'Locating...' : 'Clock In Now'}
              </button>
            ) : (
              <>
                <button
                  onClick={handleToggleBreak}
                  disabled={clockLoading}
                  style={{
                    background: activeSession.on_break ? '#f59e0b' : 'rgba(255, 255, 255, 0.1)',
                    color: activeSession.on_break ? '#000' : '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    padding: '0.85rem 1.5rem',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                  }}
                >
                  {activeSession.on_break ? 'End Break' : 'Start Break'}
                </button>

                <button
                  onClick={handleClockOut}
                  disabled={clockLoading}
                  style={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: '#fff',
                    border: 'none',
                    padding: '0.85rem 1.75rem',
                    fontSize: '1rem',
                    fontWeight: 700,
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)',
                  }}
                >
                  {clockLoading ? 'Saving...' : 'Clock Out'}
                </button>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Tabs Bar */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '0.25rem',
        }}
      >
        <button
          onClick={() => setActiveTab('attendance')}
          style={{
            padding: '0.65rem 1.25rem',
            background: activeTab === 'attendance' ? 'var(--bg-card)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'attendance' ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeTab === 'attendance' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'attendance' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          My Attendance & Missed Punches
        </button>

        <button
          onClick={() => setActiveTab('leave')}
          style={{
            padding: '0.65rem 1.25rem',
            background: activeTab === 'leave' ? 'var(--bg-card)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'leave' ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeTab === 'leave' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'leave' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          My Leave & Balances
        </button>

        <button
          onClick={() => setActiveTab('shifts')}
          style={{
            padding: '0.65rem 1.25rem',
            background: activeTab === 'shifts' ? 'var(--bg-card)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'shifts' ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeTab === 'shifts' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'shifts' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          My Shifts & Swaps
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: ATTENDANCE HISTORY & MISSED PUNCH CORRECTIONS                     */}
      {/* ========================================================================= */}
      {activeTab === 'attendance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* History Header & Action */}
          <Card style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Recent Attendance Log
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Your verified shift punches, breaks, and calculated payable hours.
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCorrectionModalOpen(true)}
              >
                ✏️ Request Punch Correction
              </Button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                Loading attendance history...
              </div>
            ) : myAttendance.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                <Clock size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                <p style={{ margin: 0, fontWeight: 500 }}>No attendance records recorded yet.</p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>Clock in above to start your shift.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', minWidth: '720px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.65rem' }}>Date</th>
                      <th style={{ padding: '0.65rem' }}>Clock In / Out</th>
                      <th style={{ padding: '0.65rem' }}>Punctuality</th>
                      <th style={{ padding: '0.65rem' }}>Location</th>
                      <th style={{ padding: '0.65rem' }}>Break Duration</th>
                      <th style={{ padding: '0.65rem' }}>Hours Logged</th>
                      <th style={{ padding: '0.65rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myAttendance.map((att) => {
                      const rawIn = att.clock_in || att.clock_in_time;
                      const rawOut = att.clock_out || att.clock_out_time;
                      const isLate = att.attendance_status === 'LATE' || att.is_late;
                      const hasGps = Boolean(att.clock_in_lat || att.location_lat || att.clock_in_lng || att.location_lng);
                      return (
                        <tr key={att.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.65rem', fontWeight: 600 }}>
                            {rawIn ? new Date(rawIn).toLocaleDateString() : '-'}
                          </td>
                          <td style={{ padding: '0.65rem' }}>
                            <div>In: {rawIn ? new Date(rawIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Out: {rawOut ? new Date(rawOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</div>
                          </td>
                          <td style={{ padding: '0.65rem' }}>
                            {isLate ? (
                              <Badge status="error">Late</Badge>
                            ) : rawIn ? (
                              <Badge status="success">On Time</Badge>
                            ) : (
                              <Badge status="neutral">Scheduled</Badge>
                            )}
                          </td>
                          <td style={{ padding: '0.65rem' }}>
                            {!hasGps ? (
                              <Badge status="neutral">GPS Unavailable</Badge>
                            ) : att.is_verified === 1 ? (
                              <Badge status="success">Verified</Badge>
                            ) : att.requires_review === 1 || !att.verified_by_id ? (
                              <Badge status="warning">Pending Review</Badge>
                            ) : (
                              <Badge status="error">Unverified</Badge>
                            )}
                          </td>
                          <td style={{ padding: '0.65rem' }}>
                            {att.break_duration_minutes ? `${att.break_duration_minutes} mins` : 'None'}
                          </td>
                          <td style={{ padding: '0.65rem', fontWeight: 600 }}>
                            {att.total_hours ? `${parseFloat(att.total_hours).toFixed(2)}h` : 'In Progress'}
                          </td>
                          <td style={{ padding: '0.65rem' }}>
                            <Badge status={att.clock_out ? 'success' : att.on_break ? 'warning' : 'info'}>
                              {att.clock_out ? 'Completed' : att.on_break ? 'On Break' : 'Active'}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* My Submitted Corrections History */}
          {myCorrections.length > 0 && (
            <Card style={{ padding: '1.25rem' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                My Submitted Punch Corrections
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.5rem' }}>Date</th>
                      <th style={{ padding: '0.5rem' }}>Type</th>
                      <th style={{ padding: '0.5rem' }}>Requested In/Out</th>
                      <th style={{ padding: '0.5rem' }}>Reason</th>
                      <th style={{ padding: '0.5rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myCorrections.map((corr) => (
                      <tr key={corr.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.5rem' }}>{corr.shift_date}</td>
                        <td style={{ padding: '0.5rem' }}>{corr.correction_type}</td>
                        <td style={{ padding: '0.5rem' }}>
                          {corr.corrected_clock_in ? new Date(corr.corrected_clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'} to{' '}
                          {corr.corrected_clock_out ? new Date(corr.corrected_clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                        <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{corr.reason}</td>
                        <td style={{ padding: '0.5rem' }}>
                          <Badge status={corr.status === 'APPROVED' ? 'success' : corr.status === 'REJECTED' ? 'error' : 'warning'}>
                            {corr.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: LEAVE MANAGEMENT & BALANCES                                       */}
      {/* ========================================================================= */}
      {activeTab === 'leave' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Subview Toggle Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div
              style={{
                display: 'inline-flex',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                padding: '3px',
              }}
            >
              <button
                type="button"
                onClick={() => setLeaveSubView('list')}
                style={{
                  background: leaveSubView === 'list' ? 'var(--brand-accent)' : 'transparent',
                  color: leaveSubView === 'list' ? '#ffffff' : 'var(--text-muted)',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Balances & Requests
              </button>
              <button
                type="button"
                onClick={() => setLeaveSubView('calendar')}
                style={{
                  background: leaveSubView === 'calendar' ? 'var(--brand-accent)' : 'transparent',
                  color: leaveSubView === 'calendar' ? '#ffffff' : 'var(--text-muted)',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                My Leave Calendar
              </button>
            </div>

            <Button variant="primary" size="sm" onClick={() => setIsLeaveModalOpen(true)} style={{ minHeight: '38px' }}>
              + Apply for Leave
            </Button>
          </div>

          {leaveSubView === 'calendar' ? (
            <AbsenceCalendar leaveRequests={myLeaveRequests} isManager={false} />
          ) : (
            <>
              {/* Leave Entitlement Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                {myLeaveBalances.map((bal, idx) => {
                  const allocated = parseFloat(bal.total_allocated || 0);
                  const remaining = parseFloat(bal.remaining_days || 0);
                  const used = parseFloat(bal.used_days || 0);
                  const pending = parseFloat(bal.pending_days || 0);
                  const usedPct = allocated > 0 ? Math.min(100, Math.round((used / allocated) * 100)) : 0;
                  const pendingPct = allocated > 0 ? Math.min(100, Math.round((pending / allocated) * 100)) : 0;

                  return (
                    <Card
                      key={bal.leave_category_id || bal.id || idx}
                      style={{ padding: '1.25rem', borderTop: '4px solid #10b981', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                          {bal.category_name || 'Leave Allowance'}
                        </div>
                        <Badge status={bal.is_paid ? 'success' : 'neutral'}>
                          {bal.is_paid ? 'Paid' : 'Unpaid'}
                        </Badge>
                      </div>

                      <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981' }}>
                        {remaining}{' '}
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          days left
                        </span>
                      </div>

                      {/* Usage bar */}
                      <div
                        style={{
                          height: '6px',
                          background: 'var(--bg-surface)',
                          borderRadius: '9999px',
                          margin: '0.35rem 0',
                          overflow: 'hidden',
                          display: 'flex',
                        }}
                      >
                        <div style={{ width: `${usedPct}%`, background: '#ef4444' }} title={`Used: ${used}d`} />
                        <div style={{ width: `${pendingPct}%`, background: '#f59e0b' }} title={`Pending: ${pending}d`} />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span>Allotted: <strong>{allocated}d</strong></span>
                        <span>Used: <strong style={{ color: '#ef4444' }}>{used}d</strong></span>
                        {pending > 0 && <span>Pending: <strong style={{ color: '#f59e0b' }}>{pending}d</strong></span>}
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Leave Applications History */}
              <Card style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      My Leave Applications History
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Submitted vacation, medical, and personal time-off applications.
                    </p>
                  </div>
                </div>

                {loading ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    Loading leave records...
                  </div>
                ) : myLeaveRequests.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    <Calendar size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontWeight: 500 }}>No leave applications submitted yet.</p>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Click "+ Apply for Leave" to request scheduled time off.
                    </p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: '780px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '0.65rem' }}>Code</th>
                          <th style={{ padding: '0.65rem' }}>Category</th>
                          <th style={{ padding: '0.65rem' }}>Inclusive Dates</th>
                          <th style={{ padding: '0.65rem' }}>Duration</th>
                          <th style={{ padding: '0.65rem' }}>Reason</th>
                          <th style={{ padding: '0.65rem' }}>Applied On</th>
                          <th style={{ padding: '0.65rem' }}>Status</th>
                          <th style={{ padding: '0.65rem' }}>Supervisor Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myLeaveRequests.map((req) => {
                          const isPending = req.status === 'PENDING_MANAGER' || req.status === 'PENDING_ADMIN';
                          return (
                            <tr key={req.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '0.65rem', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                {req.request_code}
                              </td>
                              <td style={{ padding: '0.65rem', fontWeight: 600 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                  <span>{req.category_name || req.category_code || 'Leave'}</span>
                                  {req.document_url && (
                                    <span title="Supporting Document Attached" style={{ color: 'var(--brand-accent)' }}>
                                      📎
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '0.65rem' }}>
                                {req.start_date} to {req.end_date}
                              </td>
                              <td style={{ padding: '0.65rem', fontWeight: 700 }}>{req.total_days} day(s)</td>
                              <td style={{ padding: '0.65rem', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={req.reason}>
                                {req.reason}
                              </td>
                              <td style={{ padding: '0.65rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                {req.created_at ? new Date(req.created_at).toLocaleDateString() : '-'}
                              </td>
                              <td style={{ padding: '0.65rem' }}>
                                <Badge
                                  status={
                                    req.status === 'APPROVED'
                                      ? 'success'
                                      : req.status === 'REJECTED'
                                      ? 'error'
                                      : 'warning'
                                  }
                                >
                                  {req.status === 'PENDING_ADMIN' ? 'Pending Admin' : req.status === 'PENDING_MANAGER' ? 'Pending Manager' : req.status}
                                </Badge>
                              </td>
                              <td style={{ padding: '0.65rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {req.manager_notes || req.admin_notes || (isPending ? <em>Under supervisor review</em> : '-')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SHIFTS, AVAILABILITY & SWAPS                                       */}
      {/* ========================================================================= */}
      {activeTab === 'shifts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Availability Settings Widget */}
          <Card style={{ padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Set My Work Availability
            </h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Notify the Operations Manager of your upcoming preferred or unavailable dates.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="date"
                className="input-field"
                value={availabilityDate}
                onChange={(e) => setAvailabilityDate(e.target.value)}
                style={{ width: 'auto' }}
              />
              <select
                className="input-field"
                value={availabilityStatus}
                onChange={(e) => setAvailabilityStatus(e.target.value)}
                style={{ width: 'auto' }}
              >
                <option value="AVAILABLE">Available for Shift</option>
                <option value="UNAVAILABLE">Unavailable / Rest Day</option>
                <option value="PREFERRED">Preferred Shift Time</option>
              </select>
              <Button size="sm" variant="primary" onClick={handleSaveAvailability}>
                Save Preference
              </Button>
            </div>
          </Card>

          {/* Assigned Shifts & Swap Requests */}
          <Card style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  My Assigned Shifts
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Upcoming duty schedule and peer swap requests.
                </p>
              </div>

              <Button variant="outline" size="sm" onClick={() => setIsSwapModalOpen(true)}>
                🔄 Request Shift Swap
              </Button>
            </div>

            {myShifts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                No upcoming scheduled shifts. Check back once the Operations Manager publishes the roster.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.65rem' }}>Date</th>
                      <th style={{ padding: '0.65rem' }}>Shift Hours</th>
                      <th style={{ padding: '0.65rem' }}>Property</th>
                      <th style={{ padding: '0.65rem' }}>Department</th>
                      <th style={{ padding: '0.65rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myShifts.map((s) => (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.65rem', fontWeight: 600 }}>{s.shift_date}</td>
                        <td style={{ padding: '0.65rem' }}>
                          {s.start_time} - {s.end_time}
                        </td>
                        <td style={{ padding: '0.65rem' }}>{s.property_name || 'Assigned'}</td>
                        <td style={{ padding: '0.65rem' }}>{s.department || 'Operations'}</td>
                        <td style={{ padding: '0.65rem' }}>
                          <Badge status="success">{s.status || 'SCHEDULED'}</Badge>
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
      {/* MODAL: REQUEST PUNCH CORRECTION                                          */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isCorrectionModalOpen}
        onClose={() => setIsCorrectionModalOpen(false)}
        title="Request Attendance Punch Correction"
      >
        <form onSubmit={handleSubmitCorrection} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label">Shift Date *</label>
            <input
              type="date"
              className="input-field"
              required
              value={correctionForm.shift_date}
              onChange={(e) => setCorrectionForm({ ...correctionForm, shift_date: e.target.value })}
            />
          </div>

          <div>
            <label className="form-label">Correction Type *</label>
            <select
              className="input-field"
              value={correctionForm.correction_type}
              onChange={(e) => setCorrectionForm({ ...correctionForm, correction_type: e.target.value })}
            >
              <option value="CLOCK_IN">Missed Clock-In</option>
              <option value="CLOCK_OUT">Missed Clock-Out</option>
              <option value="BOTH">Missed Both In & Out</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">Requested Clock In</label>
              <input
                type="datetime-local"
                className="input-field"
                value={correctionForm.corrected_clock_in}
                onChange={(e) => setCorrectionForm({ ...correctionForm, corrected_clock_in: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Requested Clock Out</label>
              <input
                type="datetime-local"
                className="input-field"
                value={correctionForm.corrected_clock_out}
                onChange={(e) => setCorrectionForm({ ...correctionForm, corrected_clock_out: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Reason / Explanation *</label>
            <textarea
              className="input-field"
              rows={2}
              required
              placeholder="e.g. System was down, device malfunction, or forgot to punch..."
              value={correctionForm.reason}
              onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button type="button" variant="ghost" onClick={() => setIsCorrectionModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Submit Request
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: APPLY FOR LEAVE                                                   */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        title="Submit Leave Application"
      >
        <form onSubmit={handleSubmitLeave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label">Leave Category *</label>
            <select
              className="input-field"
              required
              value={leaveForm.leave_category_id}
              onChange={(e) => setLeaveForm({ ...leaveForm, leave_category_id: e.target.value })}
            >
              {leaveCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.default_days_per_year} days/yr • {c.is_paid ? 'Paid' : 'Unpaid'}{c.requires_document ? ' • Doc Required' : ''})
                </option>
              ))}
            </select>
            {selectedCategory?.description && (
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {selectedCategory.description}
              </p>
            )}
          </div>

          {/* Document Requirement Banner */}
          {selectedCategory?.requires_document && (
            <div
              style={{
                background: 'rgba(217, 119, 6, 0.08)',
                border: '1px solid rgba(217, 119, 6, 0.25)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem',
                fontSize: '0.8rem',
                color: 'var(--text-primary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, color: '#d97706', marginBottom: '0.25rem' }}>
                <AlertTriangle size={15} />
                <span>Supporting Documentation Required</span>
              </div>
              <p style={{ margin: '0 0 0.5rem', color: 'var(--text-secondary)' }}>
                This category requires an official doctor's note, medical certificate, or legal documentation.
              </p>
              <div>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>
                  Document URL / Cloud Reference Link *
                </label>
                <input
                  type="text"
                  className="input-field"
                  required
                  placeholder="e.g. https://storage.bfa.com/medical-certs/cert-2026.pdf or file reference"
                  value={leaveForm.document_url}
                  onChange={(e) => setLeaveForm({ ...leaveForm, document_url: e.target.value })}
                  style={{ width: '100%', fontSize: '0.8rem' }}
                />
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">Start Date *</label>
              <input
                type="date"
                className="input-field"
                required
                value={leaveForm.start_date}
                onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">End Date *</label>
              <input
                type="date"
                className="input-field"
                required
                value={leaveForm.end_date}
                onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
              />
            </div>
          </div>

          {/* Dynamic Duration Feedback */}
          {calculatedDays > 0 && (
            <div
              style={{
                background: 'rgba(37, 99, 235, 0.08)',
                border: '1px solid rgba(37, 99, 235, 0.2)',
                borderRadius: 'var(--radius-md)',
                padding: '0.65rem 0.85rem',
                fontSize: '0.825rem',
                color: 'var(--text-primary)',
              }}
            >
              <div>
                Requested Duration: <strong style={{ color: 'var(--brand-accent)' }}>{calculatedDays} day(s)</strong>
              </div>
              {calculatedDays > 14 ? (
                <div style={{ color: '#d97706', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                  ⚠️ Extended leave: Requests over 14 days exceed manager delegation and require Executive Administrator sign-off.
                </div>
              ) : calculatedDays > 5 ? (
                <div style={{ color: 'var(--brand-accent)', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                  ℹ️ Leaves exceeding 5 days are automatically routed for Executive Administrator review.
                </div>
              ) : null}
            </div>
          )}

          {calculatedDays === -1 && (
            <div style={{ color: '#ef4444', fontSize: '0.8rem', fontWeight: 600 }}>
              ⚠️ Start date cannot be after end date.
            </div>
          )}

          <div>
            <label className="form-label">Reason / Explanation *</label>
            <textarea
              className="input-field"
              rows={2}
              required
              placeholder="Explain the purpose of your leave request (e.g. Annual family vacation, medical appointment)..."
              value={leaveForm.reason}
              onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button type="button" variant="ghost" onClick={() => setIsLeaveModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={calculatedDays <= 0}>
              Submit Application
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: REQUEST SHIFT SWAP                                                */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isSwapModalOpen}
        onClose={() => setIsSwapModalOpen(false)}
        title="Request Peer Shift Swap"
      >
        <form onSubmit={handleSubmitSwap} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label">Select Your Shift *</label>
            <select
              className="input-field"
              required
              value={swapForm.shift_id}
              onChange={(e) => setSwapForm({ ...swapForm, shift_id: e.target.value })}
            >
              <option value="">-- Choose Assigned Shift --</option>
              {myShifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.shift_date} ({s.start_time} - {s.end_time})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Select Peer Colleague *</label>
            <select
              className="input-field"
              required
              value={swapForm.target_employee_id}
              onChange={(e) => setSwapForm({ ...swapForm, target_employee_id: e.target.value })}
            >
              <option value="">-- Choose Colleague --</option>
              {colleagues.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name} ({c.job_title || 'Staff'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Reason for Swap *</label>
            <textarea
              className="input-field"
              rows={2}
              required
              placeholder="Explain reason for peer shift exchange..."
              value={swapForm.reason}
              onChange={(e) => setSwapForm({ ...swapForm, reason: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button type="button" variant="ghost" onClick={() => setIsSwapModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Send Swap Request
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

