import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('bfa_auth_token') || null);
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('bfa_auth_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  // Synchronize portal theme with authenticated identity across all 7 operational roles
  useEffect(() => {
    let roleKey = (user?.role || '').toLowerCase();
    if (roleKey === 'operations_manager') {
      roleKey = 'manager';
    }
    const validThemes = ['super_admin', 'admin', 'owner', 'manager', 'staff', 'receptionist', 'agent'];
    const activeTheme = validThemes.includes(roleKey) ? roleKey : 'default';
    document.documentElement.setAttribute('data-portal-theme', activeTheme);
  }, [user]);

  // Validate existing session on application boot
  useEffect(() => {
    async function validateSession() {
      const savedToken = localStorage.getItem('bfa_auth_token');
      if (!savedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await authService.getMe();
        if (res.data?.user) {
          setUser(res.data.user);
          localStorage.setItem('bfa_auth_user', JSON.stringify(res.data.user));
        } else {
          logout();
        }
      } catch (err) {
        console.warn('Session verification failed:', err.message);
        logout();
      } finally {
        setIsLoading(false);
      }
    }

    validateSession();
  }, []);

  const login = async (email, password) => {
    const res = await authService.login({ email, password });
    const { token: newToken, user: authenticatedUser } = res.data;

    localStorage.setItem('bfa_auth_token', newToken);
    localStorage.setItem('bfa_auth_user', JSON.stringify(authenticatedUser));
    setToken(newToken);
    setUser(authenticatedUser);

    return authenticatedUser;
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch {
      // Ignore network errors on logout
    } finally {
      localStorage.removeItem('bfa_auth_token');
      localStorage.removeItem('bfa_auth_user');
      setToken(null);
      setUser(null);
      document.documentElement.setAttribute('data-portal-theme', 'default');
    }
  };

  const hasPermission = (permission) => {
    if (!user) return false;
    return Boolean(user.permissions?.includes(permission));
  };

  // Backward-compatible role object for existing page badges
  const isOperationsManager = ['OPERATIONS_MANAGER', 'MANAGER'].includes(user?.role);
  const activeRoleObj = {
    id: user?.role?.toLowerCase() || 'guest',
    name: user?.role === 'OPERATIONS_MANAGER' ? 'OPERATIONS_MANAGER' : (user?.role || 'Guest'),
    label: isOperationsManager ? 'Operations Manager' : (user?.role ? user.role.replace('_', ' ') : 'Guest'),
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: !!token && !!user,
        isLoading,
        isSuperAdmin: user?.role === 'SUPER_ADMIN',
        isOperationsManager,
        login,
        logout,
        hasPermission,
        activeRoleObj,
        currentRole: user?.role?.toLowerCase() || 'guest',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Backward-compatible alias
export const useRole = useAuth;
