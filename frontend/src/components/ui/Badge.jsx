import React from 'react';

export default function Badge({ status = 'neutral', children, className = '' }) {
  const normalizedStatus = String(status).toLowerCase().replace(/_/g, '-');
  return (
    <span className={`badge badge-${normalizedStatus} ${className}`}>
      {children || status}
    </span>
  );
}
