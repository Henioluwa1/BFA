import React, { createContext, useContext, useState, useEffect } from 'react';

import { propertyService } from '../services/api';

const PropertyContext = createContext();

export function PropertyProvider({ children }) {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(false);

  const [activePropertyId, setActivePropertyId] = useState(() => {
    return localStorage.getItem('bfa_active_property_id') || 'all';
  });

  const fetchProperties = async () => {
    setLoading(true);
    try {
      const res = await propertyService.getAll();
      if (res.data && Array.isArray(res.data)) {
        setProperties(res.data);
      }
    } catch {
      // Fallback or unauthenticated
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, []);

  const handleSetProperty = (propertyId) => {
    setActivePropertyId(propertyId);
    localStorage.setItem('bfa_active_property_id', propertyId);
  };

  const activeProperty = properties.find((p) => String(p.id) === String(activePropertyId)) || null;

  return (
    <PropertyContext.Provider
      value={{
        properties,
        setProperties,
        activePropertyId,
        setActivePropertyId: handleSetProperty,
        activeProperty,
        isAllProperties: activePropertyId === 'all',
        loading,
        refreshProperties: fetchProperties,
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
