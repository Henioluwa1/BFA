import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';
import { guestService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatNaira } from '../../utils/currency';

export default function GuestsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasPermission } = useAuth();
  const { addToast } = useToast();

  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

  const [selectedGuest, setSelectedGuest] = useState(null);
  const [duplicates, setDuplicates] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    city: 'Lagos',
    country: 'Nigeria',
    nationality: 'Nigerian',
    identification_type: 'NIN',
    identification_number: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    status: 'ACTIVE',
    notes: '',
  });

  const fetchGuests = async () => {
    setLoading(true);
    try {
      const res = await guestService.getAll({
        search: search.trim() || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
      });
      setGuests(res.data || []);
    } catch (err) {
      addToast(`Error fetching guests: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGuests();
  }, [statusFilter]);

  // Synchronize URL search params for deep-linking
  useEffect(() => {
    const qSearch = searchParams.get('search');
    if (qSearch) {
      setSearch(qSearch);
      guestService.getAll({ search: qSearch.trim() })
        .then((res) => {
          if (res.data) setGuests(res.data);
          const qId = searchParams.get('guestId');
          if (qId && res.data) {
            const found = res.data.find((g) => String(g.id) === String(qId));
            if (found) handleOpenDetail(found);
          }
        })
        .catch(() => {});
    } else {
      const qId = searchParams.get('guestId');
      if (qId) {
        guestService.getById(qId)
          .then((res) => {
            if (res.data) handleOpenDetail(res.data);
          })
          .catch(() => {});
      }
    }
  }, [searchParams]);

  const handleOpenAdd = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      address: '',
      city: 'Lagos',
      country: 'Nigeria',
      nationality: 'Nigerian',
      identification_type: 'NIN',
      identification_number: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      status: 'ACTIVE',
      notes: '',
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (guest) => {
    setSelectedGuest(guest);
    setFormData({
      first_name: guest.first_name || '',
      last_name: guest.last_name || '',
      email: guest.email || '',
      phone: guest.phone || '',
      address: guest.address || '',
      city: guest.city || 'Lagos',
      country: guest.country || 'Nigeria',
      nationality: guest.nationality || 'Nigerian',
      identification_type: guest.identification_type || 'NIN',
      identification_number: guest.identification_number || '',
      emergency_contact_name: guest.emergency_contact_name || '',
      emergency_contact_phone: guest.emergency_contact_phone || '',
      status: guest.status || 'ACTIVE',
      notes: guest.notes || '',
    });
    setIsEditModalOpen(true);
  };

  const handleOpenDetail = async (guest) => {
    try {
      const res = await guestService.getById(guest.id);
      setSelectedGuest(res.data);
    } catch {
      setSelectedGuest(guest);
    }
    setIsDetailModalOpen(true);
  };

  const handleSubmitAdd = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await guestService.create(formData);
      addToast('Guest profile created successfully!', 'success');
      setIsAddModalOpen(false);
      fetchGuests();
    } catch (err) {
      addToast(`Failed to create guest: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitEdit = async (e) => {
    e.preventDefault();
    if (!selectedGuest) return;
    setActionLoading(true);
    try {
      await guestService.update(selectedGuest.id, formData);
      addToast('Guest profile updated successfully!', 'success');
      setIsEditModalOpen(false);
      fetchGuests();
    } catch (err) {
      addToast(`Failed to update guest: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenDuplicates = async () => {
    setActionLoading(true);
    try {
      const res = await guestService.getDuplicates();
      setDuplicates(res.data || []);
      setIsDuplicateModalOpen(true);
    } catch (err) {
      addToast(`Error checking duplicates: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMerge = async (primaryId, duplicateId) => {
    setActionLoading(true);
    try {
      await guestService.merge({ primaryId, duplicateId });
      addToast('Guest records successfully merged!', 'success');
      setIsDuplicateModalOpen(false);
      fetchGuests();
    } catch (err) {
      addToast(`Merge failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      header: 'Guest / Tenant',
      key: 'display_name',
      render: (val, row) => (
        <div>
          <div
            style={{ fontWeight: 700, color: 'var(--brand-accent)', cursor: 'pointer' }}
            onClick={() => handleOpenDetail(row)}
            title="Click to view full guest profile and stay history"
          >
            👤 {val} ↗
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {row.email} • {row.phone}
          </div>
        </div>
      ),
    },
    {
      header: 'Location / Nationality',
      key: 'city',
      render: (val, row) => (
        <span style={{ fontSize: '0.85rem' }}>
          {val || 'Lagos'}, {row.country || 'Nigeria'} ({row.nationality || 'Nigerian'})
        </span>
      ),
    },
    {
      header: 'ID Reference',
      key: 'identification_number',
      render: (val, row) => (
        <span style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
          {val ? `${row.identification_type}: ${val}` : '—'}
        </span>
      ),
    },
    {
      header: 'Stays',
      key: 'total_reservations',
      render: (val, row) => (
        <div>
          <strong>{val || 0} stays</strong>
          {Number(row.active_reservations) > 0 && (
            <span style={{ color: 'var(--status-available-text)', fontSize: '0.75rem', marginLeft: '0.35rem' }}>
              ({row.active_reservations} active)
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      key: 'status',
      render: (val) => <Badge status={val}>{val}</Badge>,
    },
    {
      header: 'Actions',
      key: 'actions',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <Button variant="outline" size="sm" onClick={() => handleOpenDetail(row)}>
            Profile
          </Button>
          {hasPermission('guests.edit') && (
            <Button variant="outline" size="sm" onClick={() => handleOpenEdit(row)}>
              Edit
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0 }}>
              Tenants & Guests Directory
            </h1>
            <Badge status="available">PHASE 6 DOMAIN</Badge>
          </div>
          <p className="page-subtitle" style={{ marginTop: '0.35rem' }}>
            Authoritative guest identity profiles, historical stay records, VIP status tagging, and duplicate merge workflows.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Button variant="outline" size="sm" onClick={handleOpenDuplicates}>
            🔍 Duplicate Manager
          </Button>
          {hasPermission('guests.create') && (
            <Button variant="primary" size="sm" onClick={handleOpenAdd}>
              + Add New Guest
            </Button>
          )}
        </div>
      </div>

      {/* Filter Card */}
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Search Guest Name / Email / Phone / ID / Booking Code:
            </label>
            <input
              type="text"
              placeholder="Search guests..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchGuests()}
              style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', marginTop: '2px', color: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', marginTop: '2px', color: 'var(--text-primary)' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="VIP">VIP</option>
              <option value="FLAGGED">Flagged</option>
              <option value="BLOCKED">Blocked</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="primary" size="sm" onClick={fetchGuests} loading={loading} style={{ flex: 1 }}>
              Search
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch('');
                setStatusFilter('ALL');
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </Card>

      {/* Guests Table */}
      <Card title={`Registered Guests (${guests.length})`}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading guests...
          </div>
        ) : (
          <Table columns={columns} data={guests} emptyMessage="No guest records match your search." />
        )}
      </Card>

      {/* Add / Edit Guest Modal */}
      <Modal
        isOpen={isAddModalOpen || isEditModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setIsEditModalOpen(false);
        }}
        size="lg"
        icon="👤"
        title={isEditModalOpen ? `Edit Guest: ${formData.first_name} ${formData.last_name}` : 'Register New Guest Profile'}
        subtitle="Authoritative guest and tenant profile directory with identity metadata"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}>Cancel</Button>
            <Button variant="primary" onClick={isEditModalOpen ? handleSubmitEdit : handleSubmitAdd} loading={actionLoading}>
              {isEditModalOpen ? 'Save Changes' : 'Register Guest'}
            </Button>
          </div>
        }
      >
        <form onSubmit={isEditModalOpen ? handleSubmitEdit : handleSubmitAdd} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>First Name:</label>
              <input
                type="text"
                required
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Last Name:</label>
              <input
                type="text"
                required
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Email Address:</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Phone Number:</label>
              <input
                type="text"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>ID Type:</label>
              <select
                value={formData.identification_type}
                onChange={(e) => setFormData({ ...formData, identification_type: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                <option value="NIN">National Identity Number (NIN)</option>
                <option value="PASSPORT">International Passport</option>
                <option value="DRIVERS_LICENSE">Driver's License</option>
                <option value="VOTERS_CARD">Voter's Card</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>ID Number:</label>
              <input
                type="text"
                value={formData.identification_number}
                onChange={(e) => setFormData({ ...formData, identification_number: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Status:</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                <option value="ACTIVE">Active</option>
                <option value="VIP">VIP</option>
                <option value="FLAGGED">Flagged</option>
                <option value="BLOCKED">Blocked</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>City / State:</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Notes / Remarks:</label>
            <textarea
              rows={2}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            />
          </div>
        </form>
      </Modal>

      {/* Guest Profile & Reservation History Modal */}
      {selectedGuest && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          size="lg"
          icon="📋"
          title={`Guest Profile: ${selectedGuest.display_name}`}
          subtitle="Comprehensive guest particulars, emergency contact, and lifetime stay history"
          footer={
            <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  navigate(`/app/reservations?openNew=true&guestName=${encodeURIComponent(selectedGuest.display_name)}&guestEmail=${encodeURIComponent(selectedGuest.email || '')}&guestPhone=${encodeURIComponent(selectedGuest.phone || '')}`);
                }}
              >
                + Book 1-Night Stay for Guest
              </Button>
              <Button variant="outline" onClick={() => setIsDetailModalOpen(false)}>Close</Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg-card-hover)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{selectedGuest.display_name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  ✉️ {selectedGuest.email} • 📞 {selectedGuest.phone}
                </div>
              </div>
              <Badge status={selectedGuest.status}>{selectedGuest.status}</Badge>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
              <div><strong>Nationality:</strong> {selectedGuest.nationality || 'Nigerian'}</div>
              <div><strong>City:</strong> {selectedGuest.city || 'Lagos'}</div>
              <div><strong>ID Reference:</strong> {selectedGuest.identification_type}: {selectedGuest.identification_number || '—'}</div>
              <div><strong>Emergency Contact:</strong> {selectedGuest.emergency_contact_name || '—'} ({selectedGuest.emergency_contact_phone || '—'})</div>
            </div>

            {/* Historical Stays */}
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                Stay & Reservation History ({(selectedGuest.reservations || []).length})
              </div>
              {(selectedGuest.reservations || []).length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No historical bookings found for this guest.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '240px', overflowY: 'auto' }}>
                  {selectedGuest.reservations.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        padding: '0.6rem 0.75rem',
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
                        <strong
                          style={{ color: 'var(--brand-accent)', cursor: 'pointer' }}
                          onClick={() => {
                            setIsDetailModalOpen(false);
                            navigate(`/app/reservations?search=${r.reservation_code}`);
                          }}
                          title="Open booking in Reservations"
                        >
                          {r.reservation_code} ↗
                        </strong>
                        {' — '}
                        <span
                          style={{ color: 'var(--brand-accent)', cursor: 'pointer', fontWeight: 600 }}
                          onClick={() => {
                            setIsDetailModalOpen(false);
                            navigate(`/app/apartments?unitId=${r.apartment_id}&propertyId=${r.property_id}`);
                          }}
                          title="Open Unit Details"
                        >
                          Unit {r.unit_number} ↗
                        </span>
                        {' '}
                        <span
                          style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}
                          onClick={() => {
                            setIsDetailModalOpen(false);
                            navigate(`/app/properties?search=${encodeURIComponent(r.property_name || '')}`);
                          }}
                          title="Open Building in Properties"
                        >
                          ({r.property_name} ↗)
                        </span>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Stay: {r.check_in_date} → {r.check_out_date} (1 nt) • {formatNaira(r.total_amount)}
                        </div>
                      </div>
                      <Badge status={r.status}>{r.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Duplicate Management Modal */}
      {isDuplicateModalOpen && (
        <Modal
          isOpen={isDuplicateModalOpen}
          onClose={() => setIsDuplicateModalOpen(false)}
          size="md"
          icon="👥"
          title="Duplicate Profile Resolution & Merge"
          subtitle="Merge duplicate guest records, re-assigning reservation ledger and preserving audit history"
          footer={
            <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setIsDuplicateModalOpen(false)}>Close</Button>
            </div>
          }
        >
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Identifies profiles sharing the same email or phone number. Merging migrates all reservation and inspection history to the primary record.
            </p>
            {duplicates.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                ✓ No duplicate guest profiles detected in the database.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
                {duplicates.map((d, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '0.75rem',
                      background: 'var(--bg-card-hover)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div><strong>Primary:</strong> {d.primary_name} ({d.primary_email})</div>
                      <div style={{ color: 'var(--rust-light)', fontSize: '0.8rem', marginTop: '2px' }}>
                        <strong>Duplicate:</strong> {d.duplicate_name} ({d.duplicate_email}) [Match: {d.match_type}]
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleMerge(d.primary_id, d.duplicate_id)}
                      loading={actionLoading}
                    >
                      Merge Records
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
