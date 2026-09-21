import React, { createContext, useContext, useState, useEffect } from 'react';

const PropertyContext = createContext();

export function PropertyProvider({ children }) {
  // Baseline initial property state (Phase 1 establishes the multi-property abstraction)
  // Dynamic properties will be loaded from DB in Phase 3
  const [properties, setProperties] = useState([
    { id: 'prop-1', name: 'Grand Horizon Tower', code: 'GHT', unitCount: 14, location: 'Victoria Island' },
    { id: 'prop-2', name: 'Azure Bay Residences', code: 'ABR', unitCount: 8, location: 'Ikoyi Waterfront' },
    { id: 'prop-3', name: 'The Royal Palms Suites', code: 'RPS', unitCount: 12, location: 'Lekki Phase 1' },
  ]);

  const [activePropertyId, setActivePropertyId] = useState(() => {
    return localStorage.getItem('bfa_active_property_id') || 'all';
  });

  const handleSetProperty = (propertyId) => {
    setActivePropertyId(propertyId);
    localStorage.setItem('bfa_active_property_id', propertyId);
  };

  const activeProperty = properties.find((p) => p.id === activePropertyId) || null;

  return (
    <PropertyContext.Provider
      value={{
        properties,
        setProperties,
        activePropertyId,
        setActivePropertyId: handleSetProperty,
        activeProperty,
        isAllProperties: activePropertyId === 'all',
      }}
    >
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperty() {
  const context = useContext(PropertyContext);
  if (!context) {
    throw new Error('useProperty must be used within a PropertyProvider');
  }
  return context;
}
