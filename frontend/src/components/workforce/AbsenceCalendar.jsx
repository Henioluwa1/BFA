import React, { useState, useMemo } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  User,
  Clock,
  CheckCircle,
  AlertCircle,
  FileText,
  Building,
} from '../ui/Icons';

export default function AbsenceCalendar({
  leaveRequests = [],
  properties = [],
  selectedPropertyId = 'all',
  onPropertyChange,
  isManager = false,
  compact = false,
}) {
  // Calendar View State
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'agenda'
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'APPROVED' | 'PENDING'
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAbsence, setSelectedAbsence] = useState(null);

  // Month navigation
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Filter leave requests
  const filteredLeaves = useMemo(() => {
    return leaveRequests.filter((req) => {
      // Exclude rejected and cancelled
      if (req.status === 'REJECTED' || req.status === 'CANCELLED') {
        return false;
      }

      // Status filter
      if (statusFilter === 'APPROVED' && req.status !== 'APPROVED') {
        return false;
      }
      if (statusFilter === 'PENDING' && !['PENDING_MANAGER', 'PENDING_ADMIN'].includes(req.status)) {
        return false;
      }

      // Category filter
      if (categoryFilter !== 'ALL') {
        const cat = (req.category_code || req.category_name || '').toUpperCase();
        if (!cat.includes(categoryFilter.toUpperCase())) {
          return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const empName = (req.employee_name || '').toLowerCase();
        const empCode = (req.employee_code || '').toLowerCase();
        const reason = (req.reason || '').toLowerCase();
        if (!empName.includes(q) && !empCode.includes(q) && !reason.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [leaveRequests, statusFilter, categoryFilter, searchQuery]);

  // Calendar Day Generation
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days = [];

    // Previous month filler days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dayNumber: d, dateStr, isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dayNumber: d, dateStr, isCurrentMonth: true });
    }

    // Next month filler days to complete grid (multiples of 7)
    const totalCells = Math.ceil(days.length / 7) * 7;
    const remaining = totalCells - days.length;
    for (let d = 1; d <= remaining; d++) {
      const dateStr = `${year}-${String(month + 2).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dayNumber: d, dateStr, isCurrentMonth: false });
    }

    return days;
  }, [year, month]);

  // Map leaves to days
  const leavesByDate = useMemo(() => {
    const map = {};
    filteredLeaves.forEach((leave) => {
      const start = new Date(leave.start_date);
      const end = new Date(leave.end_date);

      // Normalize to midnight
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);

      const cur = new Date(start);
      while (cur <= end) {
        const dStr = cur.toISOString().split('T')[0];
        if (!map[dStr]) map[dStr] = [];
        map[dStr].push(leave);
        cur.setDate(cur.getDate() + 1);
      }
    });
    return map;
  }, [filteredLeaves]);

  // Today string
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Summary Metrics
  const metrics = useMemo(() => {
    const approved = filteredLeaves.filter((l) => l.status === 'APPROVED').length;
    const pending = filteredLeaves.filter((l) => ['PENDING_MANAGER', 'PENDING_ADMIN'].includes(l.status)).length;
    return { total: filteredLeaves.length, approved, pending };
  }, [filteredLeaves]);

  return (
    <div className="absence-calendar-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* 1. Header Toolbar */}
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {isManager ? 'Team Absence & Leave Schedule' : 'My Leave Calendar'}
              </h3>
              <Badge status="success">{metrics.approved} Approved</Badge>
              {metrics.pending > 0 && <Badge status="warning">{metrics.pending} Pending Review</Badge>}
            </div>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {isManager
                ? 'Visual timeline of authorized staff leaves and pending absence requests across operations.'
                : 'Your approved vacation days, statutory leaves, and upcoming scheduled time-off.'}
            </p>
          </div>

          {/* Navigation Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                padding: '2px',
              }}
            >
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="Previous Month"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <ChevronLeft size={16} />
              </button>

              <span style={{ fontWeight: 700, fontSize: '0.9rem', padding: '0 0.75rem', color: 'var(--text-primary)' }}>
                {monthName}
              </span>

              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="Next Month"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <Button size="sm" variant="outline" onClick={handleToday} style={{ minHeight: '36px' }}>
              Today
            </Button>

            {/* View Mode Toggle */}
            <div
              style={{
                display: 'inline-flex',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                padding: '2px',
              }}
            >
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                style={{
                  background: viewMode === 'grid' ? 'var(--brand-accent)' : 'transparent',
                  color: viewMode === 'grid' ? '#ffffff' : 'var(--text-muted)',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Month Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode('agenda')}
                style={{
                  background: viewMode === 'agenda' ? 'var(--brand-accent)' : 'transparent',
                  color: viewMode === 'agenda' ? '#ffffff' : 'var(--text-muted)',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Timeline / List
              </button>
            </div>
          </div>
        </div>

        {/* 2. Filter Bar */}
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            flexWrap: 'wrap',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border-color)',
          }}
        >
          {/* Status Filter */}
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {[
              { id: 'ALL', label: 'All Absences' },
              { id: 'APPROVED', label: 'Approved Only' },
              { id: 'PENDING', label: 'Pending Review' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                style={{
                  background: statusFilter === tab.id ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
                  color: statusFilter === tab.id ? 'var(--brand-accent)' : 'var(--text-muted)',
                  border: statusFilter === tab.id ? '1px solid var(--brand-accent)' : '1px solid var(--border-color)',
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', flex: 1, minWidth: '180px', maxWidth: '300px' }}>
            <Search
              size={14}
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              placeholder="Search staff or reason..."
              className="input-field"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '30px', fontSize: '0.8rem', minHeight: '34px', width: '100%' }}
            />
          </div>

          {/* Category Dropdown */}
          <select
            className="input-field"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ fontSize: '0.8rem', minHeight: '34px', width: 'auto' }}
          >
            <option value="ALL">All Categories</option>
            <option value="ANNUAL">Annual Leave</option>
            <option value="SICK">Sick Leave</option>
            <option value="EMERGENCY">Emergency Leave</option>
            <option value="MATERNITY">Parental / Maternity</option>
            <option value="COMPASSIONATE">Compassionate</option>
            <option value="UNPAID">Unpaid Leave</option>
          </select>
        </div>
      </div>

      {/* 3. Main Calendar View: Grid or Agenda */}
      {viewMode === 'grid' ? (
        <Card style={{ padding: '1rem', overflowX: 'auto' }}>
          <div style={{ minWidth: '680px' }}>
            {/* Day of Week Headers */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '1px',
                background: 'var(--border-color)',
                borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                overflow: 'hidden',
                textAlign: 'center',
                fontWeight: 700,
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
              }}
            >
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} style={{ background: 'var(--bg-surface)', padding: '0.65rem 0.25rem' }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Cells Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '1px',
                background: 'var(--border-color)',
                borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                overflow: 'hidden',
              }}
            >
              {calendarDays.map((cell, idx) => {
                const dayLeaves = leavesByDate[cell.dateStr] || [];
                const isToday = cell.dateStr === todayStr;

                return (
                  <div
                    key={idx}
                    style={{
                      background: cell.isCurrentMonth ? 'var(--bg-card)' : 'var(--bg-surface)',
                      minHeight: '105px',
                      padding: '0.45rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                      opacity: cell.isCurrentMonth ? 1 : 0.5,
                      border: isToday ? '2px solid var(--brand-accent)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: isToday ? 800 : 600,
                          color: isToday ? 'var(--brand-accent)' : 'var(--text-primary)',
                          background: isToday ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {cell.dayNumber}
                      </span>
                      {dayLeaves.length > 0 && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {dayLeaves.length} {dayLeaves.length === 1 ? 'leave' : 'leaves'}
                        </span>
                      )}
                    </div>

                    {/* Leave Pills */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
                      {dayLeaves.slice(0, 3).map((leave) => {
                        const isApproved = leave.status === 'APPROVED';
                        const isSick = (leave.category_code || '').includes('SICK');

                        return (
                          <button
                            key={leave.id}
                            type="button"
                            onClick={() => setSelectedAbsence(leave)}
                            title={`${leave.employee_name || 'Staff'}: ${leave.category_name} (${leave.status})`}
                            style={{
                              border: 'none',
                              textAlign: 'left',
                              padding: '2px 5px',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              lineHeight: 1.2,
                              cursor: 'pointer',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              background: isApproved
                                ? isSick
                                  ? 'rgba(239, 68, 68, 0.15)'
                                  : 'rgba(16, 185, 129, 0.15)'
                                : 'rgba(245, 158, 11, 0.18)',
                              color: isApproved
                                ? isSick
                                  ? '#ef4444'
                                  : '#10b981'
                                : '#d97706',
                              borderLeft: `3px solid ${isApproved ? (isSick ? '#ef4444' : '#10b981') : '#f59e0b'}`,
                            }}
                          >
                            {leave.employee_name || 'Staff'} • {leave.category_code || leave.category_name}
                          </button>
                        );
                      })}

                      {dayLeaves.length > 3 && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--brand-accent)', fontWeight: 700, paddingLeft: '4px' }}>
                          +{dayLeaves.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      ) : (
        /* 4. Agenda / Timeline List View (Optimized for Mobile & Chronological Review) */
        <Card style={{ padding: '1.25rem' }}>
          <h4 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Chronological Leave Agenda ({filteredLeaves.length} {filteredLeaves.length === 1 ? 'Record' : 'Records'})
          </h4>

          {filteredLeaves.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
              <CalendarIcon size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
              <p style={{ margin: 0, fontWeight: 500 }}>No leaves scheduled for this criteria.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredLeaves.map((leave) => {
                const isApproved = leave.status === 'APPROVED';
                return (
                  <div
                    key={leave.id}
                    onClick={() => setSelectedAbsence(leave)}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-color)',
                      borderLeft: `4px solid ${isApproved ? '#10b981' : '#f59e0b'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                          {leave.employee_name || `Employee #${leave.employee_id}`}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          ({leave.department || 'Operations'} • {leave.job_title || 'Staff'})
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        📅 <strong>{leave.start_date}</strong> to <strong>{leave.end_date}</strong> ({leave.total_days} day(s))
                        {' • '}
                        <span style={{ fontWeight: 600 }}>{leave.category_name}</span>
                      </div>
                      {leave.reason && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem', fontStyle: 'italic' }}>
                          "{leave.reason}"
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Badge status={isApproved ? 'success' : 'warning'}>
                        {leave.status === 'PENDING_ADMIN' ? 'Pending Admin Review' : leave.status}
                      </Badge>
                      <Button size="sm" variant="outline" style={{ fontSize: '0.75rem', padding: '4px 10px', minHeight: '32px' }}>
                        Details
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* 5. Absence Details Modal */}
      <Modal
        isOpen={Boolean(selectedAbsence)}
        onClose={() => setSelectedAbsence(null)}
        title="Absence & Leave Record Details"
      >
        {selectedAbsence && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
                fontSize: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Request Code:</span>
                <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{selectedAbsence.request_code}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Staff Member:</span>
                <span style={{ fontWeight: 700 }}>
                  {selectedAbsence.employee_name || `Employee #${selectedAbsence.employee_id}`}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Department / Role:</span>
                <span>
                  {selectedAbsence.department || 'Operations'} — {selectedAbsence.job_title || 'Staff'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Property:</span>
                <span>{selectedAbsence.property_name || `Property #${selectedAbsence.property_id}`}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Leave Category:</span>
                <Badge status="neutral">{selectedAbsence.category_name || selectedAbsence.category_code}</Badge>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Inclusive Dates:</span>
                <span style={{ fontWeight: 600 }}>
                  {selectedAbsence.start_date} to {selectedAbsence.end_date}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Duration:</span>
                <span style={{ fontWeight: 700 }}>{selectedAbsence.total_days} day(s)</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Approval Status:</span>
                <Badge
                  status={
                    selectedAbsence.status === 'APPROVED'
                      ? 'success'
                      : selectedAbsence.status === 'REJECTED'
                      ? 'error'
                      : 'warning'
                  }
                >
                  {selectedAbsence.status}
                </Badge>
              </div>

              {selectedAbsence.document_url && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Supporting Document:</span>
                  <a
                    href={selectedAbsence.document_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--brand-accent)', fontWeight: 600, textDecoration: 'underline' }}
                  >
                    View Document / Certificate
                  </a>
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Reason for Absence:
              </label>
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.75rem',
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)',
                  lineHeight: 1.4,
                }}
              >
                {selectedAbsence.reason || 'No specific explanation provided.'}
              </div>
            </div>

            {/* Review Decision Notes */}
            {(selectedAbsence.manager_notes || selectedAbsence.admin_notes) && (
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Supervisor Review Notes:
                </label>
                <div
                  style={{
                    background: 'rgba(37, 99, 235, 0.05)',
                    border: '1px solid rgba(37, 99, 235, 0.2)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.75rem',
                    fontSize: '0.85rem',
                    color: 'var(--text-primary)',
                  }}
                >
                  {selectedAbsence.manager_notes && (
                    <div>
                      <strong>Manager Note ({selectedAbsence.manager_name || 'Operations Manager'}):</strong> {selectedAbsence.manager_notes}
                    </div>
                  )}
                  {selectedAbsence.admin_notes && (
                    <div style={{ marginTop: selectedAbsence.manager_notes ? '0.4rem' : 0 }}>
                      <strong>Administrator Note ({selectedAbsence.admin_name || 'Admin'}):</strong> {selectedAbsence.admin_notes}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <Button variant="primary" onClick={() => setSelectedAbsence(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
