import React, { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Table from '../components/ui/Table';
import Modal from '../components/ui/Modal';
import { frontOfficeService, reservationService, apartmentService } from '../services/api';
import { useProperty } from '../context/PropertyContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatNaira } from '../utils/currency';

export default function FrontOfficePage() {
  const { properties, activePropertyId, setActivePropertyId } = useProperty();
  const { hasPermission } = useAuth();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState('ARRIVALS'); // 'ARRIVALS' | 'IN_HOUSE' | 'DEPARTURES' | 'HOUSEKEEPING'
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || 'all');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const [stats, setStats] = useState({
    todaysArrivals: 0,
    todaysDepartures: 0,
    inHouseGuests: 0,
    dirtyUnits: 0,
  });

  const [dataList, setDataList] = useState([]);
  const [dirtyApartments, setDirtyApartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Reservation detail modal
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Prompt modal for No-Show reason
  const [noShowId, setNoShowId] = useState(null);
  const [noShowReason, setNoShowReason] = useState('');

  // Sync with PropertyContext
  useEffect(() => {
    setPropertyFilter(activePropertyId || 'all');
  }, [activePropertyId]);

  // Fetch operational stats & tab data
  const loadFrontOfficeData = async () => {
    setLoading(true);
    try {
      // 1. Fetch stats
      const statsRes = await frontOfficeService.getStats({
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
        date: selectedDate,
      });
      setStats(statsRes.data || {});

      // 2. Fetch active tab data
      if (activeTab === 'ARRIVALS') {
        const res = await frontOfficeService.getArrivals({
          propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
          date: selectedDate,
        });
        setDataList(res.data || []);
      } else if (activeTab === 'IN_HOUSE') {
        const res = await frontOfficeService.getCurrentGuests({
          propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
        });
        setDataList(res.data || []);
      } else if (activeTab === 'DEPARTURES') {
        const res = await frontOfficeService.getDepartures({
          propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
          date: selectedDate,
        });
        setDataList(res.data || []);
      } else if (activeTab === 'HOUSEKEEPING') {
        const res = await apartmentService.getAll({
          propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
          status: 'DIRTY',
        });
        setDirtyApartments(res.data || []);
      }
    } catch (err) {
      addToast(`Error loading front office: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFrontOfficeData();
  }, [propertyFilter, selectedDate, activeTab]);

  // Actions
  const handleCheckIn = async (reservationId) => {
    setActionLoading(true);
    try {
      await frontOfficeService.checkIn(reservationId);
      addToast('Guest successfully checked in! Unit is now OCCUPIED.', 'success');
      loadFrontOfficeData();
    } catch (err) {
      addToast(`Check-in failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async (reservationId) => {
    setActionLoading(true);
    try {
      await frontOfficeService.checkOut(reservationId);
      addToast('Guest checked out successfully! Unit operational status set to DIRTY.', 'success');
      loadFrontOfficeData();
    } catch (err) {
      addToast(`Check-out failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleNoShow = async () => {
    if (!noShowId) return;
    setActionLoading(true);
    try {
      await frontOfficeService.noShow(noShowId, { reason: noShowReason || 'Guest did not arrive' });
      addToast('Reservation marked as NO_SHOW. Unit released.', 'success');
      setNoShowId(null);
      setNoShowReason('');
      loadFrontOfficeData();
    } catch (err) {
      addToast(`Failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkClean = async (apartmentId) => {
    setActionLoading(true);
    try {
      await apartmentService.updateStatus(apartmentId, { status: 'READY' });
      addToast('Unit inspected and marked READY for next guest!', 'success');
      loadFrontOfficeData();
    } catch (err) {
      addToast(`Error: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Open full reservation details
  const handleViewDetails = async (row) => {
    try {
      const res = await reservationService.getById(row.id);
      setSelectedReservation(res.data);
      setIsDetailOpen(true);
    } catch {
      setSelectedReservation(row);
      setIsDetailOpen(true);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0 }}>
              Front Office Operations
            </h1>
            <Badge status="available">LIVE DESK</Badge>
          </div>
          <p className="page-subtitle" style={{ marginTop: '0.35rem' }}>
            Authoritative operational hub managing daily arrivals, in-house guest stays, departures, and housekeeping turnover.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              padding: '0.45rem 0.65rem',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
            }}
          />
          <Button variant="outline" size="sm" onClick={loadFrontOfficeData} loading={loading}>
            ↻ Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1rem' }}>
        <div
          onClick={() => setActiveTab('ARRIVALS')}
          style={{
            background: activeTab === 'ARRIVALS' ? 'var(--brand-dim)' : 'var(--bg-card)',
            border: activeTab === 'ARRIVALS' ? '2px solid var(--brand-accent)' : '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
            Today's Arrivals
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: '#1e5c99' }}>
            {stats.todaysArrivals}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Expected arrivals today
          </div>
        </div>

        <div
          onClick={() => setActiveTab('IN_HOUSE')}
          style={{
            background: activeTab === 'IN_HOUSE' ? 'rgba(34, 139, 34, 0.1)' : 'var(--bg-card)',
            border: activeTab === 'IN_HOUSE' ? '2px solid #196f19' : '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
            In-House Guests
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: '#196f19' }}>
            {stats.inHouseGuests}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Currently staying in units
          </div>
        </div>

        <div
          onClick={() => setActiveTab('DEPARTURES')}
          style={{
            background: activeTab === 'DEPARTURES' ? 'rgba(217, 119, 6, 0.1)' : 'var(--bg-card)',
            border: activeTab === 'DEPARTURES' ? '2px solid #b45309' : '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
            Today's Departures
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: '#b45309' }}>
            {stats.todaysDepartures}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Check-outs due today
          </div>
        </div>

        <div
          onClick={() => setActiveTab('HOUSEKEEPING')}
          style={{
            background: activeTab === 'HOUSEKEEPING' ? 'rgba(220, 38, 38, 0.08)' : 'var(--bg-card)',
            border: activeTab === 'HOUSEKEEPING' ? '2px solid var(--rust-light)' : '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
            Housekeeping Queue
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--rust-light)' }}>
            {stats.dirtyUnits}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Units currently DIRTY
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.5rem' }}>
        {[
          { key: 'ARRIVALS', label: "Today's Arrivals", count: stats.todaysArrivals },
          { key: 'IN_HOUSE', label: 'Current In-House Guests', count: stats.inHouseGuests },
          { key: 'DEPARTURES', label: "Today's Departures", count: stats.todaysDepartures },
          { key: 'HOUSEKEEPING', label: 'Housekeeping Queue (DIRTY)', count: stats.dirtyUnits },
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
            }}
          >
            <span>{tab.label}</span>
            <span
              style={{
                fontSize: '0.72rem',
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

      {/* Active Tab Table Content */}
      <Card>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading front-office records...
          </div>
        ) : activeTab === 'HOUSEKEEPING' ? (
          /* Housekeeping Queue Table */
          dirtyApartments.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No dirty units in housekeeping queue! All units are ready or occupied.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {dirtyApartments.map((apt) => (
                <div
                  key={apt.id}
                  style={{
                    padding: '0.85rem',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                      Unit {apt.unit_number} — {apt.unit_name}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      {apt.property_name} • Floor: {apt.floor || 1} • Type: {apt.unit_type}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="badge badge-dirty">DIRTY</span>
                    {hasPermission('apartments.edit') && (
                      <Button variant="primary" size="sm" onClick={() => handleMarkClean(apt.id)} loading={actionLoading}>
                        ✓ Mark Ready for Booking
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : dataList.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No records found for {activeTab.replace('_', ' ')} on {selectedDate}.
          </div>
        ) : (
          /* Stays & Reservations List */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {dataList.map((row) => (
              <div
                key={row.id}
                style={{
                  padding: '1rem',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                      {row.tenant_name}
                    </span>
                    <Badge status={row.status}>{row.status}</Badge>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--brand-accent)' }}>
                      🔒 {row.auth_code}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    Unit {row.unit_number} ({row.property_name}) • Stay: {row.check_in_date} → {row.check_out_date} (1 nt)
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    📞 {row.tenant_phone} • Balance: {formatNaira(row.outstanding_balance)}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Button variant="outline" size="sm" onClick={() => handleViewDetails(row)}>
                    View Details
                  </Button>

                  {activeTab === 'ARRIVALS' && row.status === 'CONFIRMED' && hasPermission('reservations.checkin') && (
                    <>
                      <Button variant="primary" size="sm" onClick={() => handleCheckIn(row.id)} loading={actionLoading}>
                        🛎 Check-In Guest
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setNoShowId(row.id);
                          setNoShowReason('');
                        }}
                      >
                        ⚠️ No-Show
                      </Button>
                    </>
                  )}

                  {(activeTab === 'IN_HOUSE' || activeTab === 'DEPARTURES') &&
                    row.status === 'CHECKED_IN' &&
                    hasPermission('reservations.checkout') && (
                      <Button variant="primary" size="sm" onClick={() => handleCheckOut(row.id)} loading={actionLoading}>
                        🚪 Check-Out (Release to DIRTY)
                      </Button>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* No-Show Modal */}
      {noShowId && (
        <Modal
          isOpen={!!noShowId}
          onClose={() => setNoShowId(null)}
          title="Confirm Guest No-Show"
          footer={
            <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setNoShowId(null)}>Cancel</Button>
              <Button variant="primary" onClick={handleNoShow} loading={actionLoading}>Confirm No-Show</Button>
            </div>
          }
        >
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Marking this reservation as NO_SHOW will release the unit for other guests and document the operational reason in the audit trail.
            </p>
            <input
              type="text"
              placeholder="Reason for no-show..."
              value={noShowReason}
              onChange={(e) => setNoShowReason(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', marginTop: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            />
          </div>
        </Modal>
      )}

      {/* Detail Modal */}
      {selectedReservation && (
        <Modal
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          title={`Booking: ${selectedReservation.reservation_code}`}
          footer={
            <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Close</Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg-card-hover)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status</div>
                <Badge status={selectedReservation.status}>{selectedReservation.status}</Badge>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Booking Code</div>
                <strong style={{ fontFamily: 'monospace', color: 'var(--brand-accent)' }}>
                  🔒 {selectedReservation.auth_code}
                </strong>
              </div>
            </div>
            <div><strong>Guest:</strong> {selectedReservation.tenant_name} ({selectedReservation.tenant_phone})</div>
            <div><strong>Property & Unit:</strong> {selectedReservation.property_name} — Unit {selectedReservation.unit_number}</div>
            <div><strong>Stay:</strong> {selectedReservation.check_in_date} → {selectedReservation.check_out_date} (1 Night Max)</div>
            <div><strong>Total Rate:</strong> {formatNaira(selectedReservation.total_amount)}</div>
            <div><strong>Paid to Date:</strong> {formatNaira(selectedReservation.paid_amount)}</div>
            <div><strong>Outstanding:</strong> {formatNaira(selectedReservation.outstanding_balance)}</div>
          </div>
        </Modal>
      )}
    </div>
  );
}
