import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ProtectedRoute({ allowedRoles = [], children }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-heading)',
          fontWeight: 700,
          fontSize: '1.2rem',
        }}
      >
        Authenticating BFA Session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If role-restricted and user does not match, redirect to dashboard
  if (allowedRoles.length > 0) {
    const userRole = (user?.role || '').toUpperCase();
    const normalizedAllowed = allowedRoles.flatMap((r) => {
      const up = r.toUpperCase();
      if (up === 'MANAGER' || up === 'OPERATIONS_MANAGER') return ['MANAGER', 'OPERATIONS_MANAGER'];
      return [up];
    });
    if (!normalizedAllowed.includes(userRole)) {
      return <Navigate to="/app/dashboard" replace />;
    }
  }

  return children ? children : <Outlet />;
}
