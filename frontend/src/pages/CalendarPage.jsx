import React, { useState, useEffect, useMemo } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { calendarService, reservationService, apartmentService } from '../services/api';
import { useProperty } from '../context/PropertyContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatNaira } from '../utils/currency';

export default function CalendarPage() {
  const { properties, activePropertyId, setActivePropertyId } = useProperty();
  const { hasPermission } = useAuth();
  const { addToast } = useToast();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week' | 'day' | 'timeline'
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || 'all');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [unitFilter, setUnitFilter] = useState('all');

  const [events, setEvents] = useState([]);
  const [timelineData, setTimelineData] = useState(null);
  const [apartments, setApartments] = useState([]);
  const [loading, setLoading] = useState(false);

  // Selected reservation for detail modal
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Sync propertyFilter with PropertyContext
  useEffect(() => {
    setPropertyFilter(activePropertyId || 'all');
  }, [activePropertyId]);

  // Fetch apartments for unit filter
  useEffect(() => {
    async function loadApartments() {
      try {
        const res = await apartmentService.getAll({
          propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
        });
        setApartments(res.data || []);
      } catch {
        setApartments([]);
      }
    }
    loadApartments();
  }, [propertyFilter]);

  // Calculate current date range based on viewMode
  const dateRange = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (viewMode === 'month') {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      };
    } else if (viewMode === 'week') {
      const curr = new Date(currentDate);
      const first = curr.getDate() - curr.getDay();
      const start = new Date(curr.setDate(first));
      const end = new Date(curr.setDate(first + 6));
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      };
    } else if (viewMode === 'day') {
      const d = currentDate.toISOString().split('T')[0];
      return { startDate: d, endDate: d };
    } else {
      // Timeline: 14-day window
      const start = new Date(currentDate);
      start.setDate(start.getDate() - 2);
      const end = new Date(currentDate);
      end.setDate(end.getDate() + 12);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      };
    }
  }, [currentDate, viewMode]);

  // Fetch calendar events
  const fetchCalendar = async () => {
    setLoading(true);
    try {
      if (viewMode === 'timeline') {
        const res = await calendarService.getAvailability({
          propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        });
        setTimelineData(res.data);
      } else {
        const res = await calendarService.getEvents({
          propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
          apartmentId: unitFilter !== 'all' ? unitFilter : undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          fromDate: dateRange.startDate,
          toDate: dateRange.endDate,
        });
        setEvents(res.data || []);
      }
    } catch (err) {
      addToast(`Error loading calendar: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendar();
  }, [propertyFilter, unitFilter, statusFilter, dateRange, viewMode]);

  // Navigate calendar
  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
    else if (viewMode === 'week') d.setDate(d.getDate() - 7);
    else if (viewMode === 'day') d.setDate(d.getDate() - 1);
    else d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
    else if (viewMode === 'week') d.setDate(d.getDate() + 7);
    else if (viewMode === 'day') d.setDate(d.getDate() + 1);
    else d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Open detail modal for event
  const handleEventClick = async (event) => {
    setSelectedEvent(event);
    if (event.type === 'RESERVATION') {
      try {
        const res = await reservationService.getById(event.eventId);
        setSelectedReservation(res.data);
      } catch {
        setSelectedReservation(null);
      }
    } else {
      setSelectedReservation(null);
    }
    setIsModalOpen(true);
  };

  // Lifecycle actions from calendar modal
  const handleConfirm = async () => {
    if (!selectedReservation) return;
    setActionLoading(true);
    try {
      const res = await reservationService.confirm(selectedReservation.id);
      addToast('Reservation confirmed!', 'success');
      setSelectedReservation(res.data);
      fetchCalendar();
    } catch (err) {
      addToast(`Error: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!selectedReservation) return;
    setActionLoading(true);
    try {
      const res = await reservationService.checkIn(selectedReservation.id);
      addToast('Guest checked in! Unit is now OCCUPIED.', 'success');
      setSelectedReservation(res.data);
      fetchCalendar();
    } catch (err) {
      addToast(`Error: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!selectedReservation) return;
    setActionLoading(true);
    try {
      const res = await reservationService.checkOut(selectedReservation.id);
      addToast('Guest checked out! Unit set to DIRTY.', 'success');
      setSelectedReservation(res.data);
      fetchCalendar();
    } catch (err) {
      addToast(`Error: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Color helper for badges
  const getEventBadgeClass = (status) => {
    const s = String(status || '').toUpperCase();
    if (s === 'CONFIRMED') return 'badge-confirmed';
    if (s === 'CHECKED_IN') return 'badge-checked-in';
    if (s === 'COMPLETED') return 'badge-completed';
    if (s === 'CANCELLED') return 'badge-cancelled';
    if (s === 'BLOCKED') return 'badge-blocked';
    return 'badge-pending';
  };

  // Build Month Grid
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    // Leading empty days
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ dayNumber: null, dateStr: null, isCurrentMonth: false });
    }
    // Month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dayNumber: d, dateStr, isCurrentMonth: true });
    }
    return days;
  }, [currentDate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0 }}>
              Reservation Calendar
            </h1>
            <Badge status="available">PHASE 5 ENGINE</Badge>
          </div>
          <p className="page-subtitle" style={{ marginTop: '0.35rem' }}>
            Authoritative visual operational calendar synchronizing reservations, maintenance blocks, and unit occupancy.
          </p>
        </div>

        {/* View Switcher & Navigator */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '2px' }}>
            {['month', 'week', 'day', 'timeline'].map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  border: 'none',
                  background: viewMode === mode ? 'var(--brand-accent)' : 'transparent',
                  color: viewMode === mode ? '#ffffff' : 'var(--text-secondary)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                {mode}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <Button variant="outline" size="sm" onClick={handlePrev}>‹</Button>
            <Button variant="outline" size="sm" onClick={handleToday}>Today</Button>
            <Button variant="outline" size="sm" onClick={handleNext}>›</Button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '0.75rem', alignItems: 'center' }}>
          {/* Active Period Display */}
          <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            {viewMode === 'day' && ` ${currentDate.getDate()}`}
          </div>

          {/* Property Selector */}
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Property:</label>
            <select
              value={propertyFilter}
              onChange={(e) => {
                setPropertyFilter(e.target.value);
                setActivePropertyId(e.target.value);
              }}
              style={{ width: '100%', padding: '0.45rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', marginTop: '2px', color: 'var(--text-primary)' }}
            >
              <option value="all">All Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Unit Selector */}
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Unit:</label>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              style={{ width: '100%', padding: '0.45rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', marginTop: '2px', color: 'var(--text-primary)' }}
            >
              <option value="all">All Units</option>
              {apartments.map((a) => (
                <option key={a.id} value={a.id}>Unit {a.unit_number} ({a.property_name})</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: '100%', padding: '0.45rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', marginTop: '2px', color: 'var(--text-primary)' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="CHECKED_IN">Checked In</option>
              <option value="PENDING">Pending</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="badge badge-confirmed" style={{ fontSize: '0.65rem' }}>Confirmed</span>
            <span className="badge badge-checked-in" style={{ fontSize: '0.65rem' }}>Checked In</span>
            <span className="badge badge-pending" style={{ fontSize: '0.65rem' }}>Pending</span>
            <span className="badge badge-blocked" style={{ fontSize: '0.65rem' }}>Blocked</span>
          </div>
        </div>
      </Card>

      {/* Main Calendar View Area */}
      <Card>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading calendar events...
          </div>
        ) : viewMode === 'month' ? (
          /* MONTH VIEW */
          <div>
            {/* Days of Week Header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: 'var(--border-default)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md) var(--radius-md) 0 0' }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} style={{ padding: '0.65rem', background: 'var(--bg-card-hover)', textAlign: 'center', fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: 'var(--border-default)', border: '1px solid var(--border-default)', borderTop: 'none', borderRadius: '0 0 var(--radius-md) var(--radius-md)' }}>
              {monthDays.map((cell, idx) => {
                if (!cell.isCurrentMonth) {
                  return <div key={`empty-${idx}`} style={{ minHeight: '100px', background: 'var(--bg-surface)', opacity: 0.3 }} />;
                }

                const dayEvents = events.filter((e) => cell.dateStr >= e.start && cell.dateStr <= e.end);
                const isToday = cell.dateStr === new Date().toISOString().split('T')[0];

                return (
                  <div
                    key={cell.dateStr}
                    style={{
                      minHeight: '110px',
                      background: isToday ? 'var(--brand-dim)' : 'var(--bg-card)',
                      padding: '0.4rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: isToday ? 800 : 600, fontSize: '0.8rem', color: isToday ? 'var(--brand-accent)' : 'var(--text-primary)' }}>
                        {cell.dayNumber}
                      </span>
                      {dayEvents.length > 0 && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                          {dayEvents.length} stay{dayEvents.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', overflowY: 'auto', maxHeight: '85px' }}>
                      {dayEvents.map((ev) => (
                        <div
                          key={ev.id}
                          onClick={() => handleEventClick(ev)}
                          className={getEventBadgeClass(ev.status)}
                          style={{
                            padding: '2px 5px',
                            borderRadius: '3px',
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            textAlign: 'left',
                            display: 'block',
                          }}
                          title={`${ev.title} - ${ev.propertyName}`}
                        >
                          {ev.type === 'BLOCKED' ? `🚫 ${ev.title}` : `🏠 ${ev.unitNumber}: ${ev.tenantName}`}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : viewMode === 'timeline' && timelineData ? (
          /* TIMELINE VIEW (Unit-by-Unit Track) */
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: '750px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '180px repeat(14, 1fr)', gap: '1px', background: 'var(--border-default)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
                {/* Timeline Header */}
                <div style={{ padding: '0.65rem', background: 'var(--bg-card-hover)', fontWeight: 700, fontSize: '0.8rem' }}>
                  Apartment Unit
                </div>
                {Array.from({ length: 14 }).map((_, i) => {
                  const d = new Date(timelineData.startDate);
                  d.setDate(d.getDate() + i);
                  const isToday = d.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
                  return (
                    <div
                      key={i}
                      style={{
                        padding: '0.5rem 0.2rem',
                        background: isToday ? 'var(--brand-dim)' : 'var(--bg-card-hover)',
                        textAlign: 'center',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: isToday ? 'var(--brand-accent)' : 'var(--text-secondary)',
                      }}
                    >
                      <div>{d.toLocaleDateString('default', { weekday: 'narrow' })}</div>
                      <div>{d.getDate()}</div>
                    </div>
                  );
                })}

                {/* Timeline Rows per Apartment */}
                {timelineData.apartments.map((apt) => (
                  <React.Fragment key={apt.id}>
                    <div style={{ padding: '0.6rem', background: 'var(--bg-card)', fontSize: '0.8rem', fontWeight: 600, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div>Unit {apt.unit_number}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{apt.property_name}</div>
                    </div>
                    {Array.from({ length: 14 }).map((_, i) => {
                      const d = new Date(timelineData.startDate);
                      d.setDate(d.getDate() + i);
                      const dStr = d.toISOString().split('T')[0];

                      const res = (timelineData.reservations || []).find(
                        (r) => r.apartment_id === apt.id && dStr >= r.check_in_date && dStr <= r.check_out_date
                      );
                      const block = (timelineData.blockedPeriods || []).find(
                        (b) => b.apartment_id === apt.id && dStr >= b.start_date && dStr <= b.end_date
                      );

                      return (
                        <div
                          key={dStr}
                          style={{
                            padding: '3px',
                            background: block ? 'rgba(239, 68, 68, 0.15)' : res ? 'rgba(43, 114, 186, 0.15)' : 'var(--bg-card)',
                            minHeight: '42px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            cursor: res ? 'pointer' : 'default',
                          }}
                          onClick={() => res && handleEventClick({ eventId: res.id, type: 'RESERVATION', ...res })}
                        >
                          {block ? '🚫' : res ? 'OCCUPIED' : '—'}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* WEEK / DAY LIST VIEW */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {events.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No reservations or blocked periods scheduled for this timeframe.
              </div>
            ) : (
              events.map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => handleEventClick(ev)}
                  style={{
                    padding: '0.85rem',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{ev.title}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      {ev.propertyName} • {ev.start} → {ev.end} (1 Night Max)
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Badge status={ev.status}>{ev.status}</Badge>
                    {ev.totalAmount && <strong>{formatNaira(ev.totalAmount)}</strong>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </Card>

      {/* Detail Modal */}
      {selectedEvent && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={selectedEvent.type === 'BLOCKED' ? 'Blocked Operational Period' : `Reservation: ${selectedEvent.reservationCode || selectedEvent.title}`}
          footer={
            <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>Close</Button>
            </div>
          }
        >
          {selectedEvent.type === 'BLOCKED' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div><strong>Property:</strong> {selectedEvent.propertyName}</div>
              <div><strong>Unit:</strong> {selectedEvent.unitNumber} ({selectedEvent.unitName})</div>
              <div><strong>Dates:</strong> {selectedEvent.start} → {selectedEvent.end}</div>
              <div><strong>Reason:</strong> {selectedEvent.reason}</div>
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '4px', color: '#b91c1c' }}>
                Unit is blocked from bookings during this period for maintenance/operations.
              </div>
            </div>
          ) : selectedReservation ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card-hover)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status</div>
                  <Badge status={selectedReservation.status}>{selectedReservation.status}</Badge>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Booking Auth Code</div>
                  <strong style={{ fontFamily: 'monospace', color: 'var(--brand-accent)' }}>
                    🔒 {selectedReservation.auth_code}
                  </strong>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Guest</div>
                  <div style={{ fontWeight: 700 }}>{selectedReservation.tenant_name}</div>
                  <div style={{ fontSize: '0.8rem' }}>{selectedReservation.tenant_phone}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Property & Unit</div>
                  <div style={{ fontWeight: 700 }}>{selectedReservation.property_name}</div>
                  <div style={{ fontSize: '0.8rem' }}>Unit {selectedReservation.unit_number} ({selectedReservation.unit_type})</div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Stay (1 Night Policy Enforced)</div>
                <div style={{ fontWeight: 700 }}>{selectedReservation.check_in_date} → {selectedReservation.check_out_date}</div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Total Amount:</span>
                  <strong>{formatNaira(selectedReservation.total_amount)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                  <span>Paid:</span>
                  <strong style={{ color: 'var(--status-available-text)' }}>{formatNaira(selectedReservation.paid_amount)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem', borderTop: '1px solid var(--border-default)', paddingTop: '0.25rem' }}>
                  <span>Outstanding:</span>
                  <strong style={{ color: 'var(--rust-light)' }}>{formatNaira(selectedReservation.outstanding_balance)}</strong>
                </div>
              </div>

              {/* Permission-aware action buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid var(--border-default)', paddingTop: '0.75rem' }}>
                {selectedReservation.status === 'PENDING' && hasPermission('reservations.edit') && (
                  <Button variant="primary" size="sm" onClick={handleConfirm} loading={actionLoading}>
                    ✓ Confirm Booking
                  </Button>
                )}
                {selectedReservation.status === 'CONFIRMED' && hasPermission('reservations.checkin') && (
                  <Button variant="primary" size="sm" onClick={handleCheckIn} loading={actionLoading}>
                    🛎 Check-In Guest
                  </Button>
                )}
                {selectedReservation.status === 'CHECKED_IN' && hasPermission('reservations.checkout') && (
                  <Button variant="primary" size="sm" onClick={handleCheckOut} loading={actionLoading}>
                    🚪 Check-Out Guest (Transitions to DIRTY)
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div>Loading reservation details...</div>
          )}
        </Modal>
      )}
    </div>
  );
}
