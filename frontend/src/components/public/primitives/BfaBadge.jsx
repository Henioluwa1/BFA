import React from 'react';
import './BfaBadge.css';

/**
 * BfaBadge - Luxury Status and Facility Indicator
 */
export default function BfaBadge({
  children,
  variant = 'champagne',
  size = 'md',
  icon = null,
  className = '',
  ...rest
}) {
  const classes = [
    'bfa-lux-badge',
    `bfa-lux-badge--${variant}`,
    `bfa-lux-badge--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...rest}>
      {icon && <span className="bfa-lux-badge-icon" aria-hidden="true">{icon}</span>}
      <span className="bfa-lux-badge-text">{children}</span>
    </span>
  );
}

