import React, { createContext, useContext, useState, useEffect } from 'react';

const RoleContext = createContext();

export const ROLES = [
  { id: 'admin', name: 'Admin', label: 'System Admin', desc: 'Full System & User Control' },
  { id: 'manager', name: 'Manager', label: 'Operations Manager', desc: 'Properties, Units & Staff Management' },
  { id: 'receptionist', name: 'Receptionist', label: 'Front Desk', desc: 'Reservations, Check-in & Guests' },
  { id: 'staff', name: 'Staff', label: 'Operations Staff', desc: 'Maintenance & Unit Status' },
  { id: 'agent', name: 'Agent', label: 'Booking Agent', desc: 'Authorized Client Bookings (Isolated)' },
  { id: 'owner', name: 'Owner', label: 'Executive Owner', desc: 'Strategic Oversight & Financials (Single Owner)' },
];

export function RoleProvider({ children }) {
  const [currentRole, setCurrentRole] = useState(() => {
    return localStorage.getItem('bfa_active_role') || 'admin';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-role', currentRole);
    localStorage.setItem('bfa_active_role', currentRole);
  }, [currentRole]);

  const activeRoleObj = ROLES.find((r) => r.id === currentRole) || ROLES[0];

  return (
    <RoleContext.Provider
      value={{
        currentRole,
        setCurrentRole,
        activeRoleObj,
        roles: ROLES,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}
