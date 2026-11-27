import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, UserCheck, ArrowRight, X } from 'lucide-react';
import { employeeService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function EmployeeWelcomeModal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [completion, setCompletion] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const sessionKey = `bfa_welcome_dismissed_${user.id}`;
    if (sessionStorage.getItem(sessionKey) === '1') return;

    employeeService
      .getMyProfile()
      .then((res) => {
        if (!active) return;
        const prof = res.data?.data || res.data || null;
        const comp = prof?.profileCompletion || null;
        if (comp?.showWelcomePopup) {
          setCompletion(comp);
          setVisible(true);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [user?.id]);

  if (!visible) return null;

  const handleCompleteNow = () => {
    setVisible(false);
    navigate('/app/my-profile');
  };

  const handleLater = async () => {
    if (user?.id) {
      sessionStorage.setItem(`bfa_welcome_dismissed_${user.id}`, '1');
    }
    setVisible(false);
    try {
      await employeeService.dismissWelcomePopup();
    } catch {
      // Never mark profile completed on dismissal
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(10, 12, 18, 0.72)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: '480px',
          borderRadius: '18px',
          background: 'linear-gradient(145deg, rgba(22, 26, 36, 0.96), rgba(14, 17, 25, 0.98))',
          border: '1px solid rgba(212, 175, 55, 0.38)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55)',
          padding: '24px',
          color: '#f8fafc',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'rgba(212, 175, 55, 0.16)',
                border: '1px solid rgba(212, 175, 55, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#d4af37',
                flexShrink: 0,
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', letterSpacing: '0.08em', color: '#d4af37', fontWeight: 700 }}>
                ONBOARDING SETUP
              </div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>
                WELCOME TO BFA MANAGEMENT SYSTEM!
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLater}
            aria-label="Close welcome dialog"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ margin: '14px 0 12px', fontSize: '0.92rem', lineHeight: 1.55, color: 'rgba(241, 245, 249, 0.88)' }}>
          {user?.name ? `Hello ${user.name}, welcome` : 'Welcome'} aboard! Your account has been created successfully.
          We are glad to have you as part of the BFA team. Please complete your profile setup so your colleagues and
          management can identify you correctly across the system.
        </p>

        {completion && (
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.09)',
              borderRadius: '10px',
              padding: '10px 12px',
              marginBottom: '18px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '6px' }}>
              <span style={{ color: 'rgba(255,255,255,0.75)' }}>Profile completion</span>
              <span style={{ color: '#d4af37', fontWeight: 700 }}>{completion.percentage}%</span>
            </div>
            <div style={{ height: '6px', borderRadius: '999px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${completion.percentage}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #d4af37, #f59e0b)',
                }}
              />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleLater}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.06)',
              color: '#e2e8f0',
              fontSize: '0.86rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Complete Later
          </button>
          <button
            type="button"
            onClick={handleCompleteNow}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 18px',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, #d4af37, #b8860b)',
              color: '#0f172a',
              fontSize: '0.86rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <UserCheck size={16} />
            <span>Complete My Profile</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
