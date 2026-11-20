import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../services/socket';
import { frontOfficeService } from '../../services/api';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  Phone,
  Mail,
  Home,
  Calendar,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';

function playAlertChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.55);
  } catch {
    // Graceful fallback
  }
}

export default function GlobalBookingAlertModal() {
  const { user } = useAuth();
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

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
      setIsMinimized(false);
      setErrorMessage(null);
      setStatusMessage('⚡ New client booking alert received!');
      setTimeout(() => setStatusMessage(null), 4000);
    };

    const handleBookingClaimed = (data) => {
      if (!data || !data.reservationId) return;
      setQueue((prev) => {
        const found = prev.find((b) => b.id === data.reservationId);
        if (!found) return prev;
        // If claimed by someone else while viewing
        if (data.claimedByUserId !== user?.id) {
          setStatusMessage(`Booking #${found.reservation_code || found.id} accepted by ${data.claimedByName || 'another staff'}`);
          setTimeout(() => setStatusMessage(null), 3500);
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
  }, [isEligible, user, fetchUnclaimed]);

  // Keep currentIndex bounded
  useEffect(() => {
    if (currentIndex >= queue.length && queue.length > 0) {
      setCurrentIndex(queue.length - 1);
    }
  }, [queue.length, currentIndex]);

  if (!isEligible || queue.length === 0) {
    return null;
  }

  const activeBooking = queue[currentIndex] || queue[0];
  if (!activeBooking) return null;

  const handleClaim = async () => {
    setIsClaiming(true);
    setErrorMessage(null);
    try {
      const res = await frontOfficeService.claimReservation(activeBooking.id);
      if (res?.success) {
        setStatusMessage(`✓ Successfully claimed ${activeBooking.tenant_name || 'guest'}!`);
        // Remove claimed item from local queue
        setQueue((prev) => prev.filter((b) => b.id !== activeBooking.id));
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (err) {
      // Concurrency lock conflict: another receptionist claimed it first
      setErrorMessage(err.message || 'This booking was already accepted by another front desk staff.');
      setTimeout(() => {
        setQueue((prev) => prev.filter((b) => b.id !== activeBooking.id));
        setErrorMessage(null);
      }, 3500);
    } finally {
      setIsClaiming(false);
    }
  };

  // Minimized floating banner pill
  if (isMinimized) {
    return (
      <div
        onClick={() => setIsMinimized(false)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '50px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 0 15px rgba(212, 175, 55, 0.4)',
          border: '1.5px solid #d4af37',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          cursor: 'pointer',
          animation: 'pulseGlow 2s infinite ease-in-out',
        }}
      >
        <span
          style={{
            background: '#ef4444',
            color: '#fff',
            borderRadius: '50%',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem',
            fontWeight: 700,
          }}
        >
          {queue.length}
        </span>
        <Bell size={18} style={{ color: '#d4af37' }} />
        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
          {queue.length === 1 ? 'New Booking Alert' : `${queue.length} Unclaimed Bookings`}
        </span>
        <span style={{ fontSize: '0.75rem', opacity: 0.7, textDecoration: 'underline' }}>View</span>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        style={{
          background: '#0f172a',
          color: '#f8fafc',
          borderRadius: '20px',
          maxWidth: '560px',
          width: '100%',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(212, 175, 55, 0.25)',
          border: '1px solid rgba(212, 175, 55, 0.4)',
          position: 'relative',
        }}
      >
        {/* Header Ribbon */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.2), rgba(30, 41, 59, 0.8))',
            padding: '16px 24px',
            borderBottom: '1px solid rgba(212, 175, 55, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid #ef4444',
                color: '#f87171',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Bell size={13} />
              HIGH PRIORITY ALERT
            </span>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 500 }}>
              Queue {currentIndex + 1} of {queue.length}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setIsMinimized(true)}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: '#cbd5e1',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Minimize
            </button>
          </div>
        </div>

        {/* Status / Error Toast notification inside modal */}
        {statusMessage && (
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.15)',
              borderBottom: '1px solid #10b981',
              color: '#34d399',
              padding: '10px 24px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
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
              padding: '10px 24px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertTriangle size={16} />
            {errorMessage}
          </div>
        )}

        {/* Modal Body */}
        <div style={{ padding: '24px' }}>
          {/* Guest Identity Card */}
          <div
            style={{
              background: 'rgba(30, 41, 59, 0.6)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Guest / Tenant
                </div>
                <h3 style={{ margin: '4px 0 8px 0', fontSize: '1.25rem', color: '#ffffff', fontWeight: 600 }}>
                  {activeBooking.tenant_name || activeBooking.guestName || 'Valued Guest'}
                </h3>
              </div>
              <span
                style={{
                  background: 'rgba(212, 175, 55, 0.15)',
                  border: '1px solid #d4af37',
                  color: '#fbbf24',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                {activeBooking.reservation_code || activeBooking.reservationCode || `BK-${activeBooking.id}`}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1' }}>
                <Phone size={14} style={{ color: '#d4af37' }} />
                <span>{activeBooking.tenant_phone || activeBooking.guestPhone || 'No phone provided'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1' }}>
                <Mail size={14} style={{ color: '#d4af37' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeBooking.tenant_email || activeBooking.guestEmail || 'No email provided'}
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
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                background: 'rgba(30, 41, 59, 0.4)',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#94a3b8' }}>
                <Home size={13} style={{ color: '#38bdf8' }} />
                <span>PROPERTY & UNIT</span>
              </div>
              <div style={{ marginTop: '4px', fontWeight: 600, color: '#f1f5f9', fontSize: '0.95rem' }}>
                {activeBooking.propertyName || activeBooking.property_name || 'BFA Property'}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                Unit: {activeBooking.unit_name || activeBooking.unit_number || activeBooking.unitNumber || 'Standard'}
              </div>
            </div>

            <div
              style={{
                background: 'rgba(30, 41, 59, 0.4)',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#94a3b8' }}>
                <Calendar size={13} style={{ color: '#a855f7' }} />
                <span>1-NIGHT STAY</span>
              </div>
              <div style={{ marginTop: '4px', fontWeight: 600, color: '#f1f5f9', fontSize: '0.95rem' }}>
                {activeBooking.check_in_date || activeBooking.checkInDate || 'Check-in'}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                to {activeBooking.check_out_date || activeBooking.checkOutDate || 'Check-out'}
              </div>
            </div>
          </div>

          {/* Financials & Concurrency Assurance */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'rgba(15, 23, 42, 0.5)',
              borderRadius: '8px',
              border: '1px dashed rgba(212, 175, 55, 0.3)',
              marginBottom: '24px',
            }}
          >
            <div>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>TOTAL RESERVATION RATE</span>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fbbf24' }}>
                ₦{Number(activeBooking.total_amount || activeBooking.totalAmount || 0).toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  background: activeBooking.payment_status === 'PAID' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  color: activeBooking.payment_status === 'PAID' ? '#34d399' : '#fbbf24',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                {activeBooking.payment_status || 'PENDING_PAYMENT'}
              </span>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>
                Strict Single-Staff Lock Enabled
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleClaim}
              disabled={isClaiming}
              style={{
                flex: 1,
                background: isClaiming
                  ? '#64748b'
                  : 'linear-gradient(135deg, #d4af37 0%, #b8972e 100%)',
                color: '#0f172a',
                border: 'none',
                padding: '14px 20px',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: isClaiming ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(212, 175, 55, 0.35)',
                transition: 'all 0.15s ease-in-out',
              }}
            >
              <ShieldCheck size={18} />
              {isClaiming ? 'Securing Claim...' : 'Claim & Accept Client'}
            </button>
          </div>

          {/* Queue Navigation footer if multiple */}
          {queue.length > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <button
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: currentIndex === 0 ? '#475569' : '#cbd5e1',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <ChevronLeft size={14} /> Previous
              </button>

              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Alert {currentIndex + 1} of {queue.length}
              </span>

              <button
                onClick={() => setCurrentIndex((prev) => Math.min(queue.length - 1, prev + 1))}
                disabled={currentIndex === queue.length - 1}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: currentIndex === queue.length - 1 ? '#475569' : '#cbd5e1',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: currentIndex === queue.length - 1 ? 'not-allowed' : 'pointer',
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
