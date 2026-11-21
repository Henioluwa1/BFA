import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { frontOfficeService } from '../../services/api';
import { getSocket } from '../../services/socket';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Home,
  Calendar,
  Phone,
  Mail,
  ShieldCheck,
  ChevronRight,
  X,
  Clock,
  ArrowLeft,
  Users,
  Maximize2,
  Minimize2,
  Sparkles,
} from 'lucide-react';

/**
 * Play a subtle luxury audio chime on arrival of new bookings
 */
function playAlertChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Pleasant two-tone ascending chime (D5 -> A5)
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880.0, ctx.currentTime + 0.18);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.55);
  } catch {
    // Graceful fallback if autoplay blocked
  }
}

/**
 * Format relative time (e.g. "Just now", "2m ago")
 */
function formatTimeAgo(dateString) {
  if (!dateString) return 'Recent';
  const now = new Date();
  const date = new Date(dateString);
  const diffSec = Math.max(0, Math.round((now - date) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

export default function GlobalBookingAlertModal() {
  const { user } = useAuth();
  const [queue, setQueue] = useState([]);
  // viewMode: 'MINIMIZED' | 'QUEUE' | 'DETAIL'
  const [viewMode, setViewMode] = useState('MINIMIZED');
  const [activeBookingId, setActiveBookingId] = useState(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [newArrivalToast, setNewArrivalToast] = useState(null);

  // The booking alert modal is strictly restricted to authenticated RECEPTIONIST role
  const isEligible = user?.role === 'RECEPTIONIST';

  // Initial fetch of pending unclaimed bookings
  const fetchUnclaimed = useCallback(async () => {
    if (!isEligible) return;
    try {
      const res = await frontOfficeService.getUnclaimedBookings();
      if (res?.success && Array.isArray(res.data)) {
        setQueue((prev) => {
          // Merge and deduplicate by booking id
          const existingIds = new Set(prev.map((b) => b.id));
          const newItems = res.data.filter((b) => !existingIds.has(b.id));
          return [...prev, ...newItems];
        });
      }
    } catch (err) {
      console.warn('[GlobalBookingAlert] Failed to fetch unclaimed queue:', err.message);
    }
  }, [isEligible]);

  useEffect(() => {
    if (isEligible) {
      fetchUnclaimed();
    }
  }, [fetchUnclaimed, isEligible]);

  // Connect socket and listen for live booking events
  useEffect(() => {
    if (!isEligible) return;

    const socket = getSocket();
    if (!socket) return;

    // Explicitly subscribe to receptionist alert channel
    socket.emit('booking:subscribe_alerts');

    const handleNewAlert = (data) => {
      if (!data || !data.id) return;
      playAlertChime();
      setQueue((prev) => {
        // Avoid duplicate entry
        if (prev.some((b) => b.id === data.id)) return prev;
        return [data, ...prev];
      });

      // Show arrival toast without disrupting any active review
      const guestName = data.tenantName || data.tenant_name || 'Guest';
      setNewArrivalToast(`⚡ New Booking: ${guestName} (${data.propertyName || data.property_name || 'Unit'})`);
      setTimeout(() => setNewArrivalToast(null), 5000);

      // If currently idle/minimized, open queue or indicate new arrival
      setViewMode((prevMode) => {
        if (prevMode === 'MINIMIZED') {
          return 'QUEUE';
        }
        return prevMode; // preserve 'DETAIL' or 'QUEUE'
      });
    };

    const handleBookingClaimed = (data) => {
      if (!data || !data.reservationId) return;
      setQueue((prev) => {
        const found = prev.find((b) => b.id === data.reservationId);
        if (!found) return prev;
        // If claimed by someone else while viewing
        if (data.claimedByUserId !== user?.id) {
          const staffName = data.claimedByName || 'another front desk staff';
          setStatusMessage(`Booking #${found.reservation_code || found.id} was claimed by ${staffName}.`);
          setTimeout(() => setStatusMessage(null), 4000);

          // If currently reviewing that claimed booking, return to queue
          if (activeBookingId === data.reservationId) {
            setErrorMessage(`This booking was just claimed by ${staffName}.`);
            setTimeout(() => {
              setErrorMessage(null);
              setActiveBookingId(null);
              setViewMode('QUEUE');
            }, 2500);
          }
        }
        return prev.filter((b) => b.id !== data.reservationId);
      });
    };

    const handleConnect = () => {
      socket.emit('booking:subscribe_alerts');
      fetchUnclaimed();
    };

    socket.on('connect', handleConnect);
    socket.on('booking:new_alert', handleNewAlert);
    socket.on('booking:claimed', handleBookingClaimed);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('booking:new_alert', handleNewAlert);
      socket.off('booking:claimed', handleBookingClaimed);
    };
  }, [isEligible, user, fetchUnclaimed, activeBookingId]);

  // Derive active booking object when in DETAIL mode
  const activeBooking = useMemo(() => {
    if (!activeBookingId) return queue[0] || null;
    return queue.find((b) => b.id === activeBookingId) || queue[0] || null;
  }, [queue, activeBookingId]);

  // Claim & Accept booking handler
  const handleClaim = async (bookingToClaim) => {
    const target = bookingToClaim || activeBooking;
    if (!target) return;

    setIsClaiming(true);
    setErrorMessage(null);

    try {
      const res = await frontOfficeService.claimReservation(target.id);
      if (res?.success) {
        const guestName = target.tenant_name || target.tenantName || 'Guest';
        setStatusMessage(`✓ Booking #${target.reservation_code || target.id} (${guestName}) successfully assigned to you!`);

        // Remove claimed item from local queue
        const remaining = queue.filter((b) => b.id !== target.id);
        setQueue(remaining);

        // Per requirement 3.2: minimize remaining bookings to top-right corner
        if (remaining.length > 0) {
          setViewMode('MINIMIZED');
          setActiveBookingId(null);
        } else {
          setViewMode('MINIMIZED');
          setActiveBookingId(null);
        }

        setTimeout(() => setStatusMessage(null), 4000);
      }
    } catch (err) {
      const isConflict =
        err?.response?.status === 409 ||
        err?.status === 409 ||
        (err.message && err.message.toLowerCase().includes('already been accepted')) ||
        (err.message && err.message.toLowerCase().includes('assigned to'));

      if (isConflict) {
        setErrorMessage(err.message || 'This booking has already been claimed by another receptionist.');
        // Remove from local queue since it is already taken
        setTimeout(() => {
          setQueue((prev) => prev.filter((b) => b.id !== target.id));
          setErrorMessage(null);
          setViewMode((prev) => (prev === 'DETAIL' ? 'QUEUE' : prev));
        }, 3000);
      } else {
        // Transient/network error: keep in queue for retry
        setErrorMessage(err.message || 'Unable to claim booking. Please check your connection and retry.');
        setTimeout(() => setErrorMessage(null), 5000);
      }
    } finally {
      setIsClaiming(false);
    }
  };

  if (!isEligible || queue.length === 0) {
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. COLLAPSED NOTIFICATION INDICATOR (Top-Right Corner)
  // ───────────────────────────────────────────────────────────────────────────
  if (viewMode === 'MINIMIZED') {
    return (
      <aside
        aria-label="Pending Booking Alerts"
        onClick={() => setViewMode('QUEUE')}
        style={{
          position: 'fixed',
          top: '76px',
          right: '24px',
          zIndex: 1000,
          background: 'linear-gradient(135deg, rgba(10, 10, 14, 0.95) 0%, rgba(20, 20, 26, 0.95) 100%)',
          color: '#ffffff',
          padding: '10px 18px',
          borderRadius: '50px',
          boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.7), 0 0 15px rgba(212, 175, 55, 0.35)',
          border: '1.5px solid #d4af37',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          animation: 'pulseGlow 2s infinite ease-in-out',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
          e.currentTarget.style.boxShadow = '0 14px 35px -5px rgba(0, 0, 0, 0.55), 0 0 20px rgba(212, 175, 55, 0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)';
          e.currentTarget.style.boxShadow = '0 10px 30px -5px rgba(0, 0, 0, 0.45), 0 0 15px rgba(212, 175, 55, 0.35)';
        }}
        title="Click to view pending bookings queue"
      >
        <span
          style={{
            background: '#ef4444',
            color: '#fff',
            borderRadius: '50%',
            minWidth: '22px',
            height: '22px',
            padding: '0 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem',
            fontWeight: 800,
            boxShadow: '0 2px 6px rgba(239, 68, 68, 0.5)',
          }}
        >
          {queue.length}
        </span>
        <Bell size={18} style={{ color: '#d4af37', flexShrink: 0 }} />
        <span style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
          NEW BOOKINGS — {queue.length} PENDING
        </span>
        <span
          style={{
            fontSize: '0.75rem',
            color: '#d4af37',
            background: 'rgba(212, 175, 55, 0.15)',
            padding: '3px 8px',
            borderRadius: '12px',
            fontWeight: 600,
            marginLeft: '4px',
          }}
        >
          Open Queue
        </span>
      </aside>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. COMPACT QUEUE PANEL (Top-Right Floating Drawer / Dropdown)
  // ───────────────────────────────────────────────────────────────────────────
  if (viewMode === 'QUEUE') {
    return (
      <aside
        aria-label="Receptionist Booking Queue Panel"
        style={{
          position: 'fixed',
          top: '76px',
          right: '24px',
          zIndex: 1000,
          width: '420px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 100px)',
          background: 'rgba(10, 10, 14, 0.94)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          color: '#ffffff',
          borderRadius: '16px',
          border: '1.5px solid rgba(255, 255, 255, 0.18)',
          boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.85), 0 0 25px rgba(212, 175, 55, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Panel Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.15), rgba(18, 18, 24, 0.95))',
            padding: '14px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid #ef4444',
                color: '#f87171',
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Bell size={12} />
              {queue.length} PENDING
            </span>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>
              Booking Alerts Queue
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => setViewMode('MINIMIZED')}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: '#cbd5e1',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Minimize queue panel"
            >
              <Minimize2 size={13} />
              Minimize
            </button>
          </div>
        </div>

        {/* Global Toast / Feedback Messages */}
        {newArrivalToast && (
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.15)',
              borderBottom: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#38bdf8',
              padding: '8px 16px',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
            }}
          >
            <Sparkles size={14} />
            {newArrivalToast}
          </div>
        )}

        {statusMessage && (
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.15)',
              borderBottom: '1px solid #10b981',
              color: '#34d399',
              padding: '8px 16px',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={14} />
            {statusMessage}
          </div>
        )}

        {errorMessage && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              borderBottom: '1px solid #ef4444',
              color: '#f87171',
              padding: '8px 16px',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
            }}
          >
            <AlertTriangle size={14} />
            {errorMessage}
          </div>
        )}

        {/* Queue Items List */}
        <div
          style={{
            overflowY: 'auto',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            maxHeight: '440px',
          }}
        >
          {queue.map((item, idx) => {
            const guestName = item.tenant_name || item.tenantName || 'Guest';
            const propName = item.propertyName || item.property_name || 'BFA Property';
            const unitName = item.unit_name || item.unit_number || item.unitNumber || 'Standard';
            const resCode = item.reservation_code || item.reservationCode || `RES-${item.id}`;
            const timeAgo = formatTimeAgo(item.created_at || item.createdAt);
            const total = Number(item.total_amount || item.totalAmount || 0);

            return (
              <div
                key={item.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                }}
              >
                {/* Item Top Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        background: 'rgba(212, 175, 55, 0.15)',
                        border: '1px solid #d4af37',
                        color: '#fbbf24',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                      }}
                    >
                      {resCode}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Clock size={11} /> {timeAgo}
                    </span>
                  </div>
                  <span
                    style={{
                      background: 'rgba(245, 158, 11, 0.2)',
                      color: '#fbbf24',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                    }}
                  >
                    PENDING CLAIM
                  </span>
                </div>

                {/* Guest & Property Info */}
                <div>
                  <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '0.92rem' }}>
                    {guestName}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '2px' }}>
                    {propName} · Unit {unitName}
                  </div>
                </div>

                {/* Amount & Action Button */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#d4af37' }}>
                    ₦{total.toLocaleString()}
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => {
                        setActiveBookingId(item.id);
                        setViewMode('DETAIL');
                      }}
                      style={{
                        background: 'linear-gradient(135deg, #d4af37 0%, #b8972e 100%)',
                        color: '#000000',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      Review & Accept <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Panel Footer */}
        <div
          style={{
            padding: '10px 16px',
            background: 'rgba(10, 10, 14, 0.95)',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: '#94a3b8',
          }}
        >
          <span>● Live Synchronized Feed</span>
          <span>{queue.length} awaiting receptionist</span>
        </div>
      </aside>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. BOOKING DETAIL REVIEW MODAL ('DETAIL' Mode)
  // ───────────────────────────────────────────────────────────────────────────
  if (!activeBooking) {
    return null;
  }

  const activeIndex = queue.findIndex((b) => b.id === activeBooking.id);
  const guestName = activeBooking.tenant_name || activeBooking.tenantName || 'Valued Guest';
  const propName = activeBooking.propertyName || activeBooking.property_name || 'BFA Property';
  const unitName = activeBooking.unit_name || activeBooking.unit_number || activeBooking.unitNumber || 'Standard';
  const resCode = activeBooking.reservation_code || activeBooking.reservationCode || `RES-${activeBooking.id}`;
  const phone = activeBooking.tenant_phone || activeBooking.guestPhone || 'No phone provided';
  const email = activeBooking.tenant_email || activeBooking.guestEmail || 'No email provided';
  const checkIn = activeBooking.check_in_date || activeBooking.checkInDate || 'Check-in date';
  const checkOut = activeBooking.check_out_date || activeBooking.checkOutDate || 'Check-out date';
  const total = Number(activeBooking.total_amount || activeBooking.totalAmount || 0);
  const paymentStatus = activeBooking.payment_status || 'PENDING_PAYMENT';
  const notes = activeBooking.notes || activeBooking.special_requests || null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review and Accept Booking"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1050,
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(18px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        style={{
          background: 'rgba(10, 10, 14, 0.95)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          color: '#ffffff',
          borderRadius: '20px',
          maxWidth: '560px',
          width: '100%',
          overflow: 'hidden',
          boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.9), 0 0 35px rgba(212, 175, 55, 0.2)',
          border: '1.5px solid rgba(255, 255, 255, 0.18)',
          position: 'relative',
        }}
      >
        {/* Header Ribbon */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.15), rgba(18, 18, 24, 0.95))',
            padding: '16px 22px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setViewMode('QUEUE')}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: '#cbd5e1',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Return to pending bookings queue"
            >
              <ArrowLeft size={14} /> Back to Queue
            </button>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>
              Queue item {activeIndex >= 0 ? activeIndex + 1 : 1} of {queue.length}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setViewMode('MINIMIZED')}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: '#cbd5e1',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Minimize to top-right corner"
            >
              <Minimize2 size={13} /> Minimize
            </button>
          </div>
        </div>

        {/* Global Toast / Feedback */}
        {newArrivalToast && (
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.15)',
              borderBottom: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#38bdf8',
              padding: '8px 22px',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
            }}
          >
            <Sparkles size={14} />
            {newArrivalToast}
          </div>
        )}

        {statusMessage && (
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.15)',
              borderBottom: '1px solid #10b981',
              color: '#34d399',
              padding: '10px 22px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={16} />
            {statusMessage}
          </div>
        )}

        {errorMessage && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              borderBottom: '1px solid #ef4444',
              color: '#f87171',
              padding: '10px 22px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 600,
            }}
          >
            <AlertTriangle size={16} />
            {errorMessage}
          </div>
        )}

        {/* Modal Body */}
        <div style={{ padding: '22px' }}>
          {/* Guest Identity Card */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '18px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Guest / Tenant
                </div>
                <h3 style={{ margin: '4px 0 6px 0', fontSize: '1.25rem', color: '#ffffff', fontWeight: 700 }}>
                  {guestName}
                </h3>
              </div>
              <span
                style={{
                  background: 'rgba(212, 175, 55, 0.15)',
                  border: '1px solid #d4af37',
                  color: '#fbbf24',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}
              >
                {resCode}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ffffff' }}>
                <Phone size={14} style={{ color: '#d4af37' }} />
                <span>{phone}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ffffff' }}>
                <Mail size={14} style={{ color: '#d4af37' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {email}
                </span>
              </div>
            </div>
          </div>

          {/* Accommodation & Stay Details */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px',
              marginBottom: '18px',
            }}
          >
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                <Home size={13} style={{ color: '#38bdf8' }} />
                <span>PROPERTY & UNIT</span>
              </div>
              <div style={{ marginTop: '4px', fontWeight: 700, color: '#ffffff', fontSize: '0.92rem' }}>
                {propName}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                Unit: {unitName} {activeBooking.unit_type ? `(${activeBooking.unit_type})` : ''}
              </div>
            </div>

            <div
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                <Calendar size={13} style={{ color: '#a855f7' }} />
                <span>STAY DATES</span>
              </div>
              <div style={{ marginTop: '4px', fontWeight: 700, color: '#ffffff', fontSize: '0.92rem' }}>
                {checkIn}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                to {checkOut}
              </div>
            </div>
          </div>

          {/* Notes if present */}
          {notes && (
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                marginBottom: '18px',
                fontSize: '0.8rem',
                color: '#ffffff',
              }}
            >
              <strong style={{ color: '#fbbf24' }}>Booking Notes / Requests:</strong> {notes}
            </div>
          )}

          {/* Financials & Single-Staff Concurrency Indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'rgba(0, 0, 0, 0.45)',
              borderRadius: '8px',
              border: '1px dashed rgba(212, 175, 55, 0.35)',
              marginBottom: '20px',
            }}
          >
            <div>
              <span style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.7)' }}>TOTAL RATE</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24' }}>
                ₦{total.toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  background: paymentStatus === 'PAID' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  color: paymentStatus === 'PAID' ? '#34d399' : '#fbbf24',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                {paymentStatus}
              </span>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>
                Atomic Concurrency Guard Active
              </div>
            </div>
          </div>

          {/* Primary Action Button */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => handleClaim(activeBooking)}
              disabled={isClaiming}
              style={{
                flex: 1,
                background: isClaiming
                  ? '#475569'
                  : 'linear-gradient(135deg, #d4af37 0%, #b8972e 100%)',
                color: '#000000',
                border: 'none',
                padding: '14px 20px',
                borderRadius: '10px',
                fontWeight: 800,
                fontSize: '1rem',
                cursor: isClaiming ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 15px rgba(212, 175, 55, 0.4)',
                transition: 'all 0.15s ease-in-out',
              }}
            >
              <ShieldCheck size={18} />
              {isClaiming ? 'Securing & Assigning Booking...' : 'APPROVE / ACCEPT BOOKING'}
            </button>
          </div>

          {/* Other bookings waiting indicator inside review modal */}
          {queue.length > 1 && (
            <div
              style={{
                marginTop: '16px',
                textAlign: 'center',
                fontSize: '0.78rem',
                color: '#94a3b8',
              }}
            >
              <span>
                {queue.length - 1} other booking{queue.length - 1 > 1 ? 's' : ''} waiting in queue.
              </span>{' '}
              <button
                onClick={() => setViewMode('QUEUE')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#d4af37',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.78rem',
                }}
              >
                View all pending
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
