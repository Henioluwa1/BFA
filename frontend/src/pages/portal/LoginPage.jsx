import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';

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

  const searchParams = new URLSearchParams(location.search);
  const isExpired = searchParams.get('expired') === '1';

  return (
    <div
      className="bfa-hospitality-scope"
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(145deg, #192a2a 0%, #101c1c 60%, #162626 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(1rem, 3vw, 2rem)',
        fontFamily: 'var(--bfa-lux-font-body, "Plus Jakarta Sans", sans-serif)',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: '440px', width: '100%', marginBottom: '1.5rem', textAlign: 'center' }}>
        <Link to="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.7rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '11px',
              background: '#192a2a',
              border: '1.5px solid #b99a70',
              color: '#b99a70',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '1.35rem',
              boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
              flexShrink: 0,
            }}
          >
            ⠿
          </div>
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontFamily: 'var(--bfa-lux-font-display, "Outfit", serif)', fontSize: '1.25rem', fontWeight: 700, letterSpacing: '0.08em', color: '#f2eee5', display: 'block', lineHeight: 1.15 }}>
              BFA APARTMENTS
            </span>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.14em', color: '#b99a70', textTransform: 'uppercase' }}>
              Serviced Residences • Akure
            </span>
          </div>
        </Link>
        <p style={{ color: 'rgba(242, 238, 229, 0.72)', fontSize: '0.84rem', marginTop: '0.65rem' }}>
          Authorized Staff &amp; Management Operations Portal
        </p>
      </div>

      <div
        style={{
          maxWidth: '440px',
          width: '100%',
          background: '#fbf9f5',
          borderRadius: '16px',
          border: '1px solid rgba(185, 154, 112, 0.35)',
          boxShadow: '0 24px 56px rgba(0, 0, 0, 0.42)',
          padding: 'clamp(1.25rem, 4vw, 2.25rem)',
          boxSizing: 'border-box',
        }}
      >
        <h2 style={{ fontFamily: 'var(--bfa-lux-font-display, "Outfit", serif)', fontSize: '1.4rem', fontWeight: 700, color: '#192a2a', marginBottom: '0.25rem', marginTop: 0 }}>
          Welcome back
        </h2>
        <p style={{ color: '#737a75', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Sign in to access your authorized role workspace.
        </p>

        {isExpired && (
          <div style={{ padding: '0.75rem', borderRadius: '8px', background: '#fdf8ee', border: '1px solid #f3dfb3', color: '#8c6014', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
            Session expired. Please log in again to continue.
          </div>
        )}

        {error && (
          <div role="alert" style={{ padding: '0.75rem', borderRadius: '8px', background: '#fcf1f1', border: '1px solid #f7c3c3', color: '#9e2323', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
            ✕ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email" style={{ color: '#202625' }}>
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
            <label className="form-label" htmlFor="login-password" style={{ color: '#202625' }}>
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
              minHeight: '46px',
              padding: '0.85rem',
              borderRadius: '10px',
              background: '#192a2a',
              color: '#f2eee5',
              border: '1px solid #b99a70',
              fontWeight: 600,
              fontSize: '0.95rem',
              letterSpacing: '0.02em',
              cursor: loading ? 'wait' : 'pointer',
              marginTop: '0.75rem',
              boxShadow: '0 6px 18px rgba(25, 42, 42, 0.22)',
              transition: 'background 150ms ease',
            }}
          >
            {loading ? 'Authenticating...' : 'Sign In to BFA Portal'}
          </button>
        </form>

        <div style={{ marginTop: '1.75rem', borderTop: '1px solid #e7e4dc', paddingTop: '1rem', textAlign: 'center', fontSize: '0.75rem', color: '#737a75' }}>
          Authorized BFA Personnel Portal • Session security enforced via JWT
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', fontSize: '0.85rem' }}>
        <Link to="/" style={{ color: '#b99a70', textDecoration: 'none', fontWeight: 600 }}>
          ← Back to Public Website
        </Link>
      </div>
    </div>
  );
}
