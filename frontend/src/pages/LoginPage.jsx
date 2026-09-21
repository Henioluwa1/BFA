import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // If already authenticated, redirect to /app/dashboard
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/app/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide your email address and password.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      await login(email, password);
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid credentials. Please verify and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTestAccountSelect = (testEmail) => {
    setEmail(testEmail);
    setPassword('Bfa2026!Secure');
    setError('');
  };

  const searchParams = new URLSearchParams(location.search);
  const isExpired = searchParams.get('expired') === '1';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(1rem, 3vw, 1.5rem)',
        fontFamily: 'var(--font-body)',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: '440px', width: '100%', marginBottom: '1.25rem', textAlign: 'center' }}>
        <Link to="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #2563eb, #1e3a8a)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.3rem',
              boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)',
              flexShrink: 0,
            }}
          >
            B
          </div>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
            BFA APARTMENTS
          </span>
        </Link>
        <p style={{ color: '#64748b', fontSize: '0.88rem', marginTop: '0.35rem' }}>
          Single Unified Authentication Portal (Section 10)
        </p>
      </div>

      <div
        style={{
          maxWidth: '440px',
          width: '100%',
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.08)',
          padding: 'clamp(1.15rem, 4vw, 2.25rem)',
          boxSizing: 'border-box',
        }}
      >
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.25rem' }}>
          Welcome back
        </h2>
        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Sign in to access your authorized role workspace.
        </p>

        {isExpired && (
          <div style={{ padding: '0.75rem', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
            Session expired. Please log in again to continue.
          </div>
        )}

        {error && (
          <div style={{ padding: '0.75rem', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecdd3', color: '#9f1239', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
            ✕ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder="user@bfa.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className="form-input"
              placeholder="••••••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.85rem',
              borderRadius: '10px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: loading ? 'wait' : 'pointer',
              marginTop: '0.75rem',
              boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)',
              transition: 'background 150ms ease',
            }}
          >
            {loading ? 'Authenticating...' : 'Sign In to BFA Portal'}
          </button>
        </form>

        {/* Quick Test Accounts Helper */}
        <div style={{ marginTop: '2rem', borderTop: '1px solid #f1f5f9', paddingTop: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.65rem' }}>
            ⚡ 1-Click Test Credentials (Evaluator Mode)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: '0.4rem' }}>
            {[
              { label: '👑 Super Admin', email: 'superadmin@bfa.com' },
              { label: '🛡️ Admin', email: 'admin@bfa.com' },
              { label: '💼 Manager', email: 'manager@bfa.com' },
              { label: '🛎️ Receptionist', email: 'receptionist@bfa.com' },
              { label: '🧹 Staff', email: 'staff@bfa.com' },
              { label: '🤝 Agent', email: 'agent@bfa.com' },
              { label: '🏛️ Owner', email: 'owner@bfa.com' },
            ].map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => handleTestAccountSelect(acc.email)}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '0.5rem 0.6rem',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#334155',
                  cursor: 'pointer',
                  textAlign: 'left',
                  minHeight: '38px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {acc.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: '#64748b' }}>
        <Link to="/" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
          ← Back to Public Website
        </Link>
      </div>
    </div>
  );
}
