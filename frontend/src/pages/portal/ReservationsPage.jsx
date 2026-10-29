import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';
import { reservationService, apartmentService, paymentService } from '../../services/api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatNaira } from '../../utils/currency';

export default function ReservationsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { properties, activePropertyId, setActivePropertyId } = useProperty();
  const { hasPermission } = useAuth();
  const { addToast } = useToast();

  const [reservations, setReservations] = useState([]);
  const [apartments, setApartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState('ALL');

  // Filters
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || 'all');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [statusHistory, setStatusHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [reservationPayments, setReservationPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // Lifecycle action prompt states
  const [actionPrompt, setActionPrompt] = useState(null); // 'CANCEL' | 'NO_SHOW' | null
  const [promptReason, setPromptReason] = useState('');

  // Form state for creating a new reservation
  const [createForm, setCreateForm] = useState({
    property_id: '',
    apartment_id: '',
    tenant_name: '',
    tenant_email: '',
    tenant_phone: '',
    check_in_date: new Date().toISOString().split('T')[0],
    source: 'DIRECT',
    agent_id: '',
    total_amount: '',
    paid_amount: '0',
    payment_method: 'PAY_AT_PROPERTY',
    special_requests: '',
    notes: '',
  });

  // Calculate check_out_date automatically (Mandatory 1-Night Stay Rule)
  const getCalculatedCheckout = (checkInDate) => {
    if (!checkInDate) return '';
    const d = new Date(checkInDate);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  const calculatedCheckout = useMemo(
    () => getCalculatedCheckout(createForm.check_in_date),
    [createForm.check_in_date]
  );

  // Synchronize propertyFilter with activePropertyId from context
  useEffect(() => {
    setPropertyFilter(activePropertyId || 'all');
  }, [activePropertyId]);

  // Synchronize URL search params for deep-linking
  useEffect(() => {
    const qSearch = searchParams.get('search');
    if (qSearch) setSearch(qSearch);

    const qPropId = searchParams.get('propertyId');
    if (qPropId) setPropertyFilter(qPropId);

    const openNew = searchParams.get('openNew');
    if (openNew === 'true') {
      setCreateForm((prev) => ({
        ...prev,
        property_id: searchParams.get('propertyId') || prev.property_id,
        apartment_id: searchParams.get('apartmentId') || prev.apartment_id,
        tenant_name: searchParams.get('guestName') || prev.tenant_name,
        tenant_email: searchParams.get('guestEmail') || prev.tenant_email,
        tenant_phone: searchParams.get('guestPhone') || prev.tenant_phone,
      }));
      setIsCreateModalOpen(true);
    }
  }, [searchParams]);

  // Fetch all reservations
  const fetchReservations = async () => {
    setLoading(true);
    try {
      const params = {
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
        status: activeTab !== 'ALL' ? activeTab : undefined,
        search: search.trim() || undefined,
        source: sourceFilter !== 'ALL' ? sourceFilter : undefined,
      };
      const res = await reservationService.getAll(params);
      setReservations(res.data || []);
    } catch (err) {
      addToast(`Error fetching reservations: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch apartments for booking dropdown
  const fetchApartments = async () => {
    try {
      const res = await apartmentService.getAll({
        propertyId: createForm.property_id || undefined,
      });
      setApartments(res.data || []);
    } catch {
      // Handled silently
    }
  };

  useEffect(() => {
    fetchReservations();
  }, [propertyFilter, activeTab, sourceFilter]);

  useEffect(() => {
    fetchApartments();
  }, [createForm.property_id]);

  // Real-time summary statistics calculation
  const stats = useMemo(() => {
    const total = reservations.length;
    const confirmed = reservations.filter((r) => r.status === 'CONFIRMED').length;
    const checkedIn = reservations.filter((r) => r.status === 'CHECKED_IN').length;
    const pending = reservations.filter((r) => r.status === 'PENDING').length;
    const completed = reservations.filter((r) => r.status === 'COMPLETED').length;
    const cancelled = reservations.filter((r) => r.status === 'CANCELLED').length;
    const noShow = reservations.filter((r) => r.status === 'NO_SHOW').length;

    const totalRevenue = reservations.reduce((sum, r) => sum + Number(r.paid_amount || 0), 0);
    const totalOutstanding = reservations.reduce(
      (sum, r) => sum + Math.max(0, Number(r.total_amount || 0) - Number(r.paid_amount || 0)),
      0
    );

    return { total, confirmed, checkedIn, pending, completed, cancelled, noShow, totalRevenue, totalOutstanding };
  }, [reservations]);

  // Client-side search & payment filter refinement
  const filteredReservations = useMemo(() => {
    return reservations.filter((r) => {
      // Payment filter
      if (paymentFilter !== 'ALL') {
        const total = Number(r.total_amount || 0);
        const paid = Number(r.paid_amount || 0);
        if (paymentFilter === 'PAID' && paid < total) return false;
        if (paymentFilter === 'PARTIAL' && (paid <= 0 || paid >= total)) return false;
        if (paymentFilter === 'UNPAID' && paid > 0) return false;
      }
      return true;
    });
  }, [reservations, paymentFilter]);

  // Handle opening Create Modal
  const handleOpenCreateModal = () => {
    const defaultProp = properties.length > 0 ? String(properties[0].id) : '';
    setCreateForm({
      property_id: defaultProp,
      apartment_id: '',
      tenant_name: '',
      tenant_email: '',
      tenant_phone: '',
      check_in_date: new Date().toISOString().split('T')[0],
      source: 'DIRECT',
      agent_id: '',
      total_amount: '',
      paid_amount: '0',
      payment_method: 'PAY_AT_PROPERTY',
      special_requests: '',
      notes: '',
    });
    setIsCreateModalOpen(true);
  };

  // Handle apartment selection in create form to prefill rate
  const handleApartmentSelect = (apartmentId) => {
    const apt = apartments.find((a) => String(a.id) === String(apartmentId));
    setCreateForm((prev) => ({
      ...prev,
      apartment_id: apartmentId,
      total_amount: apt ? String(apt.rate_per_night || 0) : prev.total_amount,
    }));
  };

  // Submit Create Reservation
  const handleSubmitCreate = async (e) => {
    e.preventDefault();
    if (!createForm.apartment_id) {
      addToast('Please select an apartment or unit', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const payload = {
        property_id: parseInt(createForm.property_id, 10),
        apartment_id: parseInt(createForm.apartment_id, 10),
        tenant_name: createForm.tenant_name.trim(),
        tenant_email: createForm.tenant_email.trim(),
        tenant_phone: createForm.tenant_phone.trim(),
        check_in_date: createForm.check_in_date,
        check_out_date: calculatedCheckout,
        source: createForm.source,
        agent_id: createForm.agent_id ? parseInt(createForm.agent_id, 10) : undefined,
        total_amount: parseFloat(createForm.total_amount) || 0,
        paid_amount: parseFloat(createForm.paid_amount) || 0,
        payment_method: createForm.payment_method,
        special_requests: createForm.special_requests.trim() || undefined,
        notes: createForm.notes.trim() || undefined,
      };

      await reservationService.create(payload);
      addToast('Reservation created successfully under 1-Night Stay Policy!', 'success');
      setIsCreateModalOpen(false);
      fetchReservations();
    } catch (err) {
      addToast(`Booking failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Detail Modal
  const handleOpenDetailModal = async (reservation) => {
    setSelectedReservation(reservation);
    setIsDetailModalOpen(true);
    setActionPrompt(null);
    setPromptReason('');

    // Fetch history
    setHistoryLoading(true);
    try {
      const res = await reservationService.getHistory(reservation.id);
      setStatusHistory(res.data || []);
    } catch {
      setStatusHistory([]);
    } finally {
      setHistoryLoading(false);
    }

    // Fetch authoritative payments ledger for this reservation
    setPaymentsLoading(true);
    try {
      const payRes = await paymentService.getTransactions({ reservationId: reservation.id });
      setReservationPayments(payRes.data || []);
    } catch {
      setReservationPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  };

  // Lifecycle action handlers
  const handleConfirmReservation = async () => {
    if (!selectedReservation) return;
    setActionLoading(true);
    try {
      const res = await reservationService.confirm(selectedReservation.id);
      addToast('Reservation confirmed successfully!', 'success');
      setSelectedReservation(res.data);
      fetchReservations();
    } catch (err) {
      addToast(`Confirmation failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckInGuest = async () => {
    if (!selectedReservation) return;
    setActionLoading(true);
    try {
      const res = await reservationService.checkIn(selectedReservation.id);
      addToast('Guest successfully checked in! Unit operational status set to OCCUPIED.', 'success');
      setSelectedReservation(res.data);
      fetchReservations();
    } catch (err) {
      addToast(`Check-in failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOutGuest = async () => {
    if (!selectedReservation) return;
    setActionLoading(true);
    try {
      const res = await reservationService.checkOut(selectedReservation.id);
      addToast('Guest checked out successfully! Unit operational status set to DIRTY for housekeeping.', 'success');
      setSelectedReservation(res.data);
      fetchReservations();
    } catch (err) {
      addToast(`Check-out failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelReservation = async () => {
    if (!selectedReservation) return;
    setActionLoading(true);
    try {
      const res = await reservationService.cancel(selectedReservation.id, {
        cancellation_reason: promptReason.trim() || 'Staff requested cancellation',
      });
      addToast('Reservation cancelled. Unit availability restored immediately.', 'success');
      setSelectedReservation(res.data);
      setActionPrompt(null);
      fetchReservations();
    } catch (err) {
      addToast(`Cancellation failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleNoShowReservation = async () => {
    if (!selectedReservation) return;
    setActionLoading(true);
    try {
      const res = await reservationService.noShow(selectedReservation.id, {
        reason: promptReason.trim() || 'Guest did not arrive for scheduled stay',
      });
      addToast('Reservation marked as NO_SHOW. Unit released.', 'success');
      setSelectedReservation(res.data);
      setActionPrompt(null);
      fetchReservations();
    } catch (err) {
      addToast(`Failed to mark no-show: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Copy Auth code to clipboard
  const handleCopyAuthCode = (code) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    addToast(`Copied booking code: ${code}`, 'info');
  };

  // Table Columns
  const columns = [
    {
      header: 'Reservation Code',
      key: 'confirmation_code',
      render: (val, row) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--brand-accent)', fontFamily: 'monospace' }}>
            {val || row.reservation_code}
          </div>
          {row.auth_code && (
            <div
              onClick={() => handleCopyAuthCode(row.auth_code)}
              title="Click to copy Auth Code"
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                marginTop: '2px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              🔒 {row.auth_code}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Property & Unit',
      key: 'property_name',
      render: (val, row) => (
        <div>
          <div
            style={{ fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}
            onClick={() => navigate(`/app/properties?search=${encodeURIComponent(val || '')}`)}
            title="Click to view building in Properties"
          >
            🏢 {val} ↗
          </div>
          <div
            style={{ fontSize: '0.8rem', color: 'var(--brand-accent)', cursor: 'pointer', fontWeight: 600, marginTop: '2px' }}
            onClick={() => navigate(`/app/apartments?unitId=${row.apartment_id}&propertyId=${row.property_id}`)}
            title="Click to view unit details and availability"
          >
            Unit {row.unit_number} {row.unit_name ? `• ${row.unit_name}` : ''} ↗
          </div>
        </div>
      ),
    },
    {
      header: 'Tenant / Guest',
      key: 'tenant_name',
      render: (val, row) => (
        <div>
          <div
            style={{ fontWeight: 700, color: 'var(--brand-accent)', cursor: 'pointer' }}
            onClick={() => navigate(`/app/guests?search=${encodeURIComponent(val || '')}`)}
            title="Click to view guest profile and stay history"
          >
            👤 {val} ↗
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {row.tenant_phone} {row.tenant_email ? `• ${row.tenant_email}` : ''}
          </div>
        </div>
      ),
    },
    {
      header: 'Stay Dates (1 Night Max)',
      key: 'check_in_date',
      render: (val, row) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
            {val} → {row.check_out_date}
          </div>
          <span
            style={{
              fontSize: '0.7rem',
              color: 'var(--rust-light)',
              fontWeight: 700,
              background: 'rgba(180, 83, 9, 0.1)',
              padding: '2px 6px',
              borderRadius: '4px',
              display: 'inline-block',
              marginTop: '2px',
            }}
          >
            1 NIGHT STAY
          </span>
        </div>
      ),
    },
    {
      header: 'Status',
      key: 'status',
      render: (val) => <Badge status={val}>{val}</Badge>,
    },
    {
      header: 'Source',
      key: 'source',
      render: (val, row) => (
        <span
          style={{
            fontSize: '0.75rem',
            padding: '2px 8px',
            background: 'var(--bg-card-hover)',
            borderRadius: '4px',
            border: '1px solid var(--border-default)',
            fontWeight: 600,
          }}
        >
          {val || 'DIRECT'}
          {row.agent_name ? ` (${row.agent_name})` : ''}
        </span>
      ),
    },
    {
      header: 'Financials (₦)',
      key: 'total_amount',
      render: (val, row) => {
        const total = Number(val || 0);
        const paid = Number(row.paid_amount || 0);
        const outstanding = Math.max(0, total - paid);
        return (
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatNaira(total)}</div>
            <div style={{ fontSize: '0.75rem', color: outstanding === 0 ? 'var(--status-available-text)' : 'var(--rust-light)' }}>
              {outstanding === 0 ? '✓ Paid' : `Bal: ${formatNaira(outstanding)}`}
            </div>
          </div>
        );
      },
    },
    {
      header: 'Actions',
      key: 'actions',
      render: (_, row) => (
        <Button variant="outline" size="sm" onClick={() => handleOpenDetailModal(row)}>
          Manage
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0 }}>
              Reservations Engine
            </h1>
            <Badge status="occupied">1-NIGHT STAY STANDARD</Badge>
          </div>
          <p className="page-subtitle" style={{ marginTop: '0.35rem' }}>
            Centralized authoritative booking engine enforcing transactional double-booking prevention, 1-night maximum policy, and real-time operational status updates.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="outline" size="sm" onClick={fetchReservations} loading={loading}>
            ↻ Refresh
          </Button>
          {hasPermission('reservations.create') && (
            <Button variant="primary" size="sm" onClick={handleOpenCreateModal}>
              + Book 1-Night Stay
            </Button>
          )}
        </div>
      </div>

      {/* Mandatory Business Policy Alert */}
      <div
        style={{
          background: 'var(--brand-dim)',
          border: '1px solid var(--brand-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'clamp(0.85rem, 2.5vw, 1.15rem)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: '1.6rem', color: 'var(--brand-accent)', flexShrink: 0 }}>ℹ</div>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <div style={{ fontWeight: 700, color: 'var(--brand-accent)', fontSize: '0.95rem' }}>
            Authoritative BFA Business Rule: Exact 1-Night Stay Policy (Section 17)
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem', lineHeight: 1.5 }}>
            Every reservation is strictly one night (<code>check_out_date = check_in_date + 1 day</code>). Double-booking is strictly prohibited through concurrency-safe transactional row locking in MySQL.
          </div>
        </div>
      </div>

      {/* Real-time Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
          gap: '1rem',
        }}
      >
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Total Bookings
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
            {stats.total}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            {stats.completed} Completed
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Confirmed / Active
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '0.25rem', color: '#1e5c99' }}>
            {stats.confirmed}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            {stats.pending} Pending approval
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Checked In Guests
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '0.25rem', color: '#196f19' }}>
            {stats.checkedIn}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Occupying units currently
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Revenue Collected
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
            {formatNaira(stats.totalRevenue)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--rust-light)', marginTop: '0.2rem' }}>
            Outstanding: {formatNaira(stats.totalOutstanding)}
          </div>
        </div>
      </div>

      {/* Tabs / Status Navigation */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--border-default)',
          paddingBottom: '0.5rem',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        {[
          { key: 'ALL', label: 'All Bookings', count: stats.total },
          { key: 'CONFIRMED', label: 'Confirmed', count: stats.confirmed },
          { key: 'CHECKED_IN', label: 'Checked In', count: stats.checkedIn },
          { key: 'PENDING', label: 'Pending', count: stats.pending },
          { key: 'COMPLETED', label: 'Completed', count: stats.completed },
          { key: 'CANCELLED', label: 'Cancelled', count: stats.cancelled },
          { key: 'NO_SHOW', label: 'No Show', count: stats.noShow },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: activeTab === tab.key ? 'var(--brand-accent)' : 'transparent',
              color: activeTab === tab.key ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.key ? 700 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease',
            }}
          >
            <span>{tab.label}</span>
            <span
              style={{
                fontSize: '0.75rem',
                background: activeTab === tab.key ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg-card-hover)',
                color: activeTab === tab.key ? '#ffffff' : 'var(--text-muted)',
                padding: '1px 6px',
                borderRadius: '10px',
              }}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
            gap: '0.75rem',
            alignItems: 'flex-end',
          }}
        >
          {/* Search */}
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Search Guest / Code / Auth:
            </label>
            <input
              type="text"
              placeholder="Search by name, code (BFA-RES-...), or auth code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchReservations()}
              style={{
                width: '100%',
                padding: '0.6rem 0.85rem',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-md)',
                marginTop: '0.25rem',
                minHeight: '38px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Property Filter */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Property:
            </label>
            <select
              value={propertyFilter}
              onChange={(e) => {
                setPropertyFilter(e.target.value);
                setActivePropertyId(e.target.value);
              }}
              style={{
                width: '100%',
                padding: '0.6rem 0.85rem',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-md)',
                marginTop: '0.25rem',
                minHeight: '38px',
                boxSizing: 'border-box',
              }}
            >
              <option value="all">All Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Source Filter */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Booking Channel:
            </label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.85rem',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-md)',
                marginTop: '0.25rem',
                minHeight: '38px',
                boxSizing: 'border-box',
              }}
            >
              <option value="ALL">All Channels</option>
              <option value="DIRECT">Direct (Front Desk)</option>
              <option value="ONLINE">Online (Public Portal)</option>
              <option value="AGENT">Agent Booking</option>
              <option value="WALK_IN">Walk In</option>
              <option value="PHONE">Phone Reservation</option>
            </select>
          </div>

          {/* Payment Status Filter */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Payment Status:
            </label>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.85rem',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-md)',
                marginTop: '0.25rem',
                minHeight: '38px',
                boxSizing: 'border-box',
              }}
            >
              <option value="ALL">All Payment States</option>
              <option value="PAID">Fully Paid</option>
              <option value="PARTIAL">Partially Paid</option>
              <option value="UNPAID">Unpaid</option>
            </select>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="primary" size="sm" onClick={fetchReservations} loading={loading} style={{ flex: 1 }}>
              Filter
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch('');
                setSourceFilter('ALL');
                setPaymentFilter('ALL');
                setPropertyFilter('all');
                setActivePropertyId('all');
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </Card>

      {/* Reservations Table */}
      <Card title={`Authoritative Bookings (${filteredReservations.length})`}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading bookings...
          </div>
        ) : (
          <Table
            columns={columns}
            data={filteredReservations}
            emptyMessage="No reservations match the current filter criteria."
          />
        )}
      </Card>

      {/* =========================================================================
          CREATE 1-NIGHT RESERVATION MODAL
          ========================================================================= */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        size="xl"
        icon="📅"
        title="Create 1-Night Authoritative Booking"
        subtitle="Transactional reservation creation with locked +1 day checkout and availability verification"
        preventBackdropClose={true}
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmitCreate} loading={actionLoading}>
              Confirm 1-Night Booking
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmitCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* 1-Night Rule Notice */}
          <div
            style={{
              background: 'var(--brand-dim)',
              border: '1px solid var(--brand-border)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem',
              fontSize: '0.82rem',
              color: 'var(--brand-accent)',
            }}
          >
            🔒 <strong>Strict Business Rule:</strong> Check-out date is automatically locked to exactly 1 night after check-in. Multi-night reservations are rejected server-side.
          </div>

          {/* Property & Apartment selection */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Select Property:
              </label>
              <select
                required
                value={createForm.property_id}
                onChange={(e) => setCreateForm({ ...createForm, property_id: e.target.value, apartment_id: '' })}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-md)',
                  marginTop: '0.25rem',
                  minHeight: '40px',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">Select Property...</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.city})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Select Apartment / Unit:
              </label>
              <select
                required
                value={createForm.apartment_id}
                onChange={(e) => handleApartmentSelect(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-md)',
                  marginTop: '0.25rem',
                  minHeight: '40px',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">Select Unit...</option>
                {apartments.map((a) => (
                  <option key={a.id} value={a.id}>
                    Unit {a.unit_number} ({a.unit_type}) — {formatNaira(a.rate_per_night)}/nt [{a.status}]
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tenant Details */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Tenant / Guest Full Name:
            </label>
            <input
              type="text"
              placeholder="e.g. Chief Adeleke Johnson"
              required
              value={createForm.tenant_name}
              onChange={(e) => setCreateForm({ ...createForm, tenant_name: e.target.value })}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-md)',
                marginTop: '0.25rem',
                minHeight: '40px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Email Address:
              </label>
              <input
                type="email"
                placeholder="guest@example.com"
                required
                value={createForm.tenant_email}
                onChange={(e) => setCreateForm({ ...createForm, tenant_email: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-md)',
                  marginTop: '0.25rem',
                  minHeight: '40px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Phone Number:
              </label>
              <input
                type="text"
                placeholder="+234 800 000 0000"
                required
                value={createForm.tenant_phone}
                onChange={(e) => setCreateForm({ ...createForm, tenant_phone: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-md)',
                  marginTop: '0.25rem',
                  minHeight: '40px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Stay Dates (1-Night Enforced) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Check-In Date:
              </label>
              <input
                type="date"
                required
                value={createForm.check_in_date}
                onChange={(e) => setCreateForm({ ...createForm, check_in_date: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-md)',
                  marginTop: '0.25rem',
                  minHeight: '40px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand-accent)' }}>
                Check-Out Date (Auto 1-Night Lock):
              </label>
              <input
                type="date"
                disabled
                value={calculatedCheckout}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  background: 'var(--bg-card-hover)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--brand-accent)',
                  borderRadius: 'var(--radius-md)',
                  marginTop: '0.25rem',
                  minHeight: '40px',
                  fontWeight: 700,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Booking Channel & Financials */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Booking Channel:
              </label>
              <select
                value={createForm.source}
                onChange={(e) => setCreateForm({ ...createForm, source: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-md)',
                  marginTop: '0.25rem',
                  minHeight: '40px',
                  boxSizing: 'border-box',
                }}
              >
                <option value="DIRECT">Direct (Front Desk)</option>
                <option value="WALK_IN">Walk In</option>
                <option value="PHONE">Phone Reservation</option>
                <option value="AGENT">Agent</option>
                <option value="ONLINE">Online Portal</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Rate per Night (₦):
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={createForm.total_amount}
                onChange={(e) => setCreateForm({ ...createForm, total_amount: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-md)',
                  marginTop: '0.25rem',
                  minHeight: '40px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Paid Amount (₦):
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={createForm.paid_amount}
                onChange={(e) => setCreateForm({ ...createForm, paid_amount: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-md)',
                  marginTop: '0.25rem',
                  minHeight: '40px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Payment Method & Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Payment Method:
              </label>
              <select
                value={createForm.payment_method}
                onChange={(e) => setCreateForm({ ...createForm, payment_method: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-md)',
                  marginTop: '0.25rem',
                  minHeight: '40px',
                  boxSizing: 'border-box',
                }}
              >
                <option value="PAY_AT_PROPERTY">Pay at Property</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CARD">Debit / Credit Card</option>
                <option value="CASH">Cash</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Special Requests / Remarks:
              </label>
              <input
                type="text"
                placeholder="e.g. Quiet floor, late arrival..."
                value={createForm.special_requests}
                onChange={(e) => setCreateForm({ ...createForm, special_requests: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-md)',
                  marginTop: '0.25rem',
                  minHeight: '40px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* =========================================================================
          RESERVATION DETAIL & LIFECYCLE MANAGEMENT MODAL
          ========================================================================= */}
      {selectedReservation && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          size="xl"
          icon="📑"
          title={`Booking: ${selectedReservation.confirmation_code || selectedReservation.reservation_code}`}
          subtitle="Authoritative stay details, security tokens, financial ledger, and operational status transitions"
          footer={
            <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button variant="outline" onClick={() => setIsDetailModalOpen(false)}>
                Close
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Header info */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.85rem',
                background: 'var(--bg-card-hover)',
                borderRadius: 'var(--radius-md)',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status</div>
                <div style={{ marginTop: '3px' }}>
                  <Badge status={selectedReservation.status}>{selectedReservation.status}</Badge>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Booking Authentication Code</div>
                <div
                  onClick={() => handleCopyAuthCode(selectedReservation.auth_code)}
                  title="Click to copy code"
                  style={{
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    color: 'var(--brand-accent)',
                    cursor: 'pointer',
                    marginTop: '3px',
                  }}
                >
                  🔒 {selectedReservation.auth_code || 'BFA-AUTH-XXXXXXXX'} (Click to copy)
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Channel</div>
                <div style={{ fontWeight: 600, marginTop: '3px' }}>
                  {selectedReservation.source || 'DIRECT'}
                </div>
              </div>
            </div>

            {/* Lifecycle Action Panel */}
            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
              }}
            >
              <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
                Operational Lifecycle Actions
              </div>

              {actionPrompt && (
                <div
                  style={{
                    background: 'var(--bg-card-hover)',
                    border: '1px solid var(--rust-light)',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '0.75rem',
                  }}
                >
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {actionPrompt === 'CANCEL' ? 'Reason for Cancellation:' : 'Reason for Marking No-Show:'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Provide operational reason for audit trail..."
                    value={promptReason}
                    onChange={(e) => setPromptReason(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-primary)',
                      borderRadius: 'var(--radius-md)',
                      marginTop: '0.35rem',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                    <Button variant="outline" size="sm" onClick={() => setActionPrompt(null)} disabled={actionLoading}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={actionPrompt === 'CANCEL' ? handleCancelReservation : handleNoShowReservation}
                      loading={actionLoading}
                    >
                      Confirm {actionPrompt === 'CANCEL' ? 'Cancellation' : 'No-Show'}
                    </Button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {selectedReservation.status === 'PENDING' && (
                  <>
                    {hasPermission('reservations.edit') && (
                      <Button variant="primary" size="sm" onClick={handleConfirmReservation} loading={actionLoading}>
                        ✓ Confirm Reservation
                      </Button>
                    )}
                    {hasPermission('reservations.cancel') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActionPrompt('CANCEL');
                          setPromptReason('');
                        }}
                        disabled={actionLoading}
                      >
                        ✕ Cancel Booking
                      </Button>
                    )}
                  </>
                )}

                {selectedReservation.status === 'CONFIRMED' && (
                  <>
                    {hasPermission('reservations.checkin') && (
                      <Button variant="primary" size="sm" onClick={handleCheckInGuest} loading={actionLoading}>
                        🛎 Check-In Guest
                      </Button>
                    )}
                    {hasPermission('reservations.cancel') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActionPrompt('CANCEL');
                          setPromptReason('');
                        }}
                        disabled={actionLoading}
                      >
                        ✕ Cancel Booking
                      </Button>
                    )}
                    {hasPermission('reservations.edit') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActionPrompt('NO_SHOW');
                          setPromptReason('');
                        }}
                        disabled={actionLoading}
                      >
                        ⚠️ Mark No-Show
                      </Button>
                    )}
                  </>
                )}

                {selectedReservation.status === 'CHECKED_IN' && (
                  <>
                    {hasPermission('reservations.checkout') && (
                      <Button variant="primary" size="sm" onClick={handleCheckOutGuest} loading={actionLoading}>
                        🚪 Check-Out Guest (Transitions Unit to DIRTY)
                      </Button>
                    )}
                  </>
                )}

                {['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(selectedReservation.status) && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    This reservation is in final state <strong>{selectedReservation.status}</strong>. Lifecycle history is archived.
                  </div>
                )}
              </div>
            </div>

            {/* Connected Workflows Quick Links */}
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                flexWrap: 'wrap',
                background: 'var(--bg-card-hover)',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                alignItems: 'center',
                border: '1px solid var(--border-default)',
              }}
            >
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Connected Workflows:
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  navigate(`/app/inspections?openNew=true&apartmentId=${selectedReservation.apartment_id}&propertyId=${selectedReservation.property_id}&reservationId=${selectedReservation.id}`);
                }}
              >
                📋 Schedule Unit Inspection
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  navigate(`/app/maintenance?openNew=true&apartmentId=${selectedReservation.apartment_id}&propertyId=${selectedReservation.property_id}`);
                }}
              >
                🔧 Log Unit Maintenance
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  const searchCode = encodeURIComponent(selectedReservation.confirmation_code || selectedReservation.reservation_code || '');
                  navigate(`/app/financial?tab=payments&search=${searchCode}`);
                }}
              >
                💳 Financial Records
              </Button>
            </div>

            {/* Details Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '1rem' }}>
              {/* Property & Unit */}
              <div
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Property & Unit
                </div>
                <div
                  style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '0.25rem', color: 'var(--brand-accent)', cursor: 'pointer' }}
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    navigate(`/app/properties?search=${encodeURIComponent(selectedReservation.property_name || '')}`);
                  }}
                  title="Navigate to Property"
                >
                  🏢 {selectedReservation.property_name} ↗
                </div>
                <div
                  style={{ fontSize: '0.85rem', color: 'var(--brand-accent)', marginTop: '0.2rem', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    navigate(`/app/apartments?unitId=${selectedReservation.apartment_id}&propertyId=${selectedReservation.property_id}`);
                  }}
                  title="Navigate to Unit Details"
                >
                  Unit {selectedReservation.unit_number} ({selectedReservation.unit_type || 'Standard'}) ↗
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Floor: {selectedReservation.floor || 1} • Capacity: {selectedReservation.capacity || 2} persons
                </div>
              </div>

              {/* Guest Information */}
              <div
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Guest Information
                </div>
                <div
                  style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '0.25rem', color: 'var(--brand-accent)', cursor: 'pointer' }}
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    navigate(`/app/guests?search=${encodeURIComponent(selectedReservation.tenant_name || '')}`);
                  }}
                  title="Navigate to Guest Profile & Stay History"
                >
                  👤 {selectedReservation.tenant_name} ↗
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  📞 {selectedReservation.tenant_phone}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  ✉️ {selectedReservation.tenant_email}
                </div>
              </div>

              {/* Stay Dates */}
              <div
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Stay Dates (1 Night Rule)
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '0.25rem' }}>
                  {selectedReservation.check_in_date} → {selectedReservation.check_out_date}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--rust-light)', fontWeight: 700, marginTop: '0.2rem' }}>
                  DURATION: 1 NIGHT (MANDATORY)
                </div>
                {selectedReservation.checked_in_at && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    Checked In: {new Date(selectedReservation.checked_in_at).toLocaleString()}
                  </div>
                )}
                {selectedReservation.checked_out_at && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Checked Out: {new Date(selectedReservation.checked_out_at).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Financial Breakdown */}
              <div
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Financial Ledger (Authoritative)
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: '0.35rem' }}>
                  <span>Total Amount:</span>
                  <strong>{formatNaira(selectedReservation.total_amount)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                  <span>Paid to Date:</span>
                  <strong style={{ color: 'var(--status-available-text)' }}>
                    {formatNaira(selectedReservation.paid_amount)}
                  </strong>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.85rem',
                    marginTop: '0.2rem',
                    borderTop: '1px solid var(--border-default)',
                    paddingTop: '0.25rem',
                  }}
                >
                  <span>Outstanding:</span>
                  <strong style={{ color: 'var(--rust-light)' }}>
                    {formatNaira(selectedReservation.outstanding_balance)}
                  </strong>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  Method: {selectedReservation.payment_method || 'PAY_AT_PROPERTY'}
                </div>

                {/* Authoritative transaction rows if any */}
                {paymentsLoading ? (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    Loading transactions...
                  </div>
                ) : reservationPayments.length > 0 ? (
                  <div style={{ marginTop: '0.5rem', borderTop: '1px dashed var(--border-default)', paddingTop: '0.35rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Authoritative Payment Records ({reservationPayments.length}):
                    </div>
                    {reservationPayments.map((p) => (
                      <div key={p.id} style={{ fontSize: '0.72rem', display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                        <span style={{ fontFamily: 'monospace' }}>{p.reference || p.transaction_code}</span>
                        <strong style={{ color: '#10b981' }}>{formatNaira(p.amount)}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Special Requests & Cancellation reason */}
            {selectedReservation.special_requests && (
              <div style={{ background: 'var(--bg-card-hover)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
                <strong style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Special Requests:</strong>
                <div style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>{selectedReservation.special_requests}</div>
              </div>
            )}

            {selectedReservation.cancellation_reason && (
              <div
                style={{
                  background: 'rgba(220, 38, 38, 0.08)',
                  border: '1px solid rgba(220, 38, 38, 0.25)',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <strong style={{ fontSize: '0.8rem', color: '#b91c1c' }}>Cancellation Details:</strong>
                <div style={{ fontSize: '0.85rem', marginTop: '0.2rem', color: '#b91c1c' }}>
                  Reason: {selectedReservation.cancellation_reason}
                </div>
                {selectedReservation.cancelled_at && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Cancelled At: {new Date(selectedReservation.cancelled_at).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {/* Lifecycle Status History Timeline */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                Authoritative Lifecycle Audit History
              </div>
              {historyLoading ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading audit history...</div>
              ) : statusHistory.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  No lifecycle transitions recorded yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {statusHistory.map((h) => (
                    <div
                      key={h.id}
                      style={{
                        padding: '0.5rem 0.75rem',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div>
                        <strong>{h.from_status || 'INITIAL'}</strong> → <Badge status={h.to_status}>{h.to_status}</Badge>
                        {h.reason && <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>({h.reason})</span>}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {new Date(h.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
