import React from 'react';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  onClick,
  type = 'button',
  icon = null,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${className}`}
      {...props}
    >
      {loading && <span className="btn-spinner">◌</span>}
      {!loading && icon && <span className="btn-icon">{icon}</span>}
      {children}
    </button>
  );
}
