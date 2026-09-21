import React, { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Table from '../components/ui/Table';
import Modal from '../components/ui/Modal';
import { reservationService, api } from '../services/api';
import { useProperty } from '../context/PropertyContext';
import { useToast } from '../context/ToastContext';

export default function ReservationsPage() {
  const { activePropertyId, activeProperty, isAllProperties } = useProperty();
  const { addToast } = useToast();
  const [reservations, setReservations] = useState([]);
  const [apartments, setApartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    apartment_id: '',
    tenant_name: '',
    tenant_email: '',
    tenant_phone: '',
    check_in_date: new Date().toISOString().split('T')[0],
  });

  // Calculate check_out_date automatically (1 Night Rule)
  const getCalculatedCheckout = (checkInDate) => {
    if (!checkInDate) return '';
    const d = new Date(checkInDate);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  const calculatedCheckout = getCalculatedCheckout(formData.check_in_date);

  const fetchReservations = async () => {
    setLoading(true);
    try {
      const res = await reservationService.getAll({ propertyId: activePropertyId });
      setReservations(res.data);
    } catch (err) {
      addToast(`Error fetching reservations: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchApartments = async () => {
    try {
      const res = await api.get('/apartments');
      setApartments(res.data || []);
      if (res.data?.length > 0 && !formData.apartment_id) {
        setFormData((prev) => ({ ...prev, apartment_id: res.data[0].id }));
      }
    } catch {
      // Handled silently
    }
  };

  useEffect(() => {
    fetchReservations();
    fetchApartments();
  }, [activePropertyId]);

  const handleSubmitBooking = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        apartment_id: parseInt(formData.apartment_id, 10),
        check_out_date: calculatedCheckout,
      };

      await reservationService.create(payload);
      addToast(`Reservation created successfully under 1-Night Max Stay policy!`, 'success');
      setIsModalOpen(false);
      fetchReservations();
    } catch (err) {
      addToast(`Booking failed: ${err.message}`, 'error');
    }
  };

  const columns = [
    { header: 'Code', key: 'reservation_code' },
    { header: 'Property', key: 'property_name' },
    { header: 'Unit', key: 'unit_number' },
    { header: 'Tenant / Guest', key: 'tenant_name' },
    {
      header: 'Stay Dates (1 Night Max)',
      key: 'check_in_date',
      render: (val, row) => (
        <span>
          {val} → {row.check_out_date} <strong style={{ color: 'var(--rust-light)' }}>({row.nights} nt)</strong>
        </span>
      ),
    },
    {
      header: 'Total ($)',
      key: 'total_amount',
      render: (val) => `$${parseFloat(val).toFixed(2)}`,
    },
    {
      header: 'Status',
      key: 'status',
      render: (val) => <Badge status={val}>{val}</Badge>,
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span>All Reservations</span>
            <Badge status="occupied">1-NIGHT STAY STANDARD</Badge>
          </h1>
          <p className="page-subtitle">
            Authoritative bookings management strictly enforcing the BFA 1-night maximum reservation policy.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="outline" size="sm" onClick={fetchReservations} loading={loading}>
            ↻ Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)}>
            + Book 1-Night Stay
          </Button>
        </div>
      </div>

      {/* Policy Notice Card (Section 16) */}
      <div
        style={{
          background: 'var(--brand-dim)',
          border: '1px solid var(--brand-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'clamp(1rem, 3vw, 1.25rem)',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: '1.8rem', color: 'var(--brand-accent)', flexShrink: 0 }}>ℹ</div>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <div style={{ fontWeight: 700, color: 'var(--brand-accent)' }}>
            Mandatory Business Policy: 1-Night Maximum Duration (Section 16)
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem', lineHeight: 1.5 }}>
            All BFA apartments and units are strictly bookable for exactly one night (<code>check_out_date = check_in_date + 1 day</code>).
            Multi-night stays and same-day checkouts are strictly rejected by the backend engine and database constraints.
          </div>
        </div>
      </div>

      <Card title={`Active Reservations (${reservations.length})`}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading bookings...
          </div>
        ) : (
          <Table columns={columns} data={reservations} emptyMessage="No reservations found." />
        )}
      </Card>

      {/* Create Reservation Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create 1-Night Reservation"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmitBooking}>
              Confirm 1-Night Stay
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmitBooking} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Select Apartment / Unit:</label>
            <select
              style={{ width: '100%', padding: '0.65rem 0.85rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', marginTop: '0.25rem', minHeight: '42px', boxSizing: 'border-box' }}
              value={formData.apartment_id}
              onChange={(e) => setFormData({ ...formData, apartment_id: e.target.value })}
              required
            >
              {apartments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.property_name} — Unit {a.unit_number} ({a.unit_name}) - ${parseFloat(a.rate_per_night).toFixed(2)}/nt
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Tenant / Guest Name:</label>
            <input
              type="text"
              placeholder="e.g. Chief Adeleke Johnson"
              required
              value={formData.tenant_name}
              onChange={(e) => setFormData({ ...formData, tenant_name: e.target.value })}
              style={{ width: '100%', padding: '0.65rem 0.85rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', marginTop: '0.25rem', minHeight: '42px', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Email Address:</label>
              <input
                type="email"
                placeholder="guest@example.com"
                required
                value={formData.tenant_email}
                onChange={(e) => setFormData({ ...formData, tenant_email: e.target.value })}
                style={{ width: '100%', padding: '0.65rem 0.85rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', marginTop: '0.25rem', minHeight: '42px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Phone Number:</label>
              <input
                type="text"
                placeholder="+234 800 000 0000"
                required
                value={formData.tenant_phone}
                onChange={(e) => setFormData({ ...formData, tenant_phone: e.target.value })}
                style={{ width: '100%', padding: '0.65rem 0.85rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', marginTop: '0.25rem', minHeight: '42px', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Check-In Date:</label>
              <input
                type="date"
                required
                value={formData.check_in_date}
                onChange={(e) => setFormData({ ...formData, check_in_date: e.target.value })}
                style={{ width: '100%', padding: '0.65rem 0.85rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', marginTop: '0.25rem', minHeight: '42px', boxSizing: 'border-box' }}
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
                style={{ width: '100%', padding: '0.65rem 0.85rem', background: 'var(--bg-card-hover)', border: '1px solid var(--border-default)', color: 'var(--brand-accent)', borderRadius: 'var(--radius-md)', marginTop: '0.25rem', minHeight: '42px', fontWeight: 700, boxSizing: 'border-box' }}
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
