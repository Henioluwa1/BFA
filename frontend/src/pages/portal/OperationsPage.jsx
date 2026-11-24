import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';

/**
 * OperationsPage (Deprecated / Consolidated)
 * Standalone Operations webpage has been integrated into Staff Chat & Central Tasks.
 * This component seamlessly redirects all traffic to /app/staff-chat.
 */
export default function OperationsPage() {
  useEffect(() => {
    // Notify floating chat or relevant handlers
    window.dispatchEvent(new CustomEvent('bfa:open-chat'));
  }, []);

  return <Navigate to="/app/staff-chat" replace />;
}
