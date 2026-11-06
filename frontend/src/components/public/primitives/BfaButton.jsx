import React from 'react';
import './BfaButton.css';

/**
 * BfaButton - Accessible Hospitality Primitive
 *
 * @param {'primary' | 'secondary' | 'forest' | 'outline' | 'ghost' | 'champagne'} variant
 * @param {'sm' | 'md' | 'lg'} size
 * @param {boolean} isLoading
 * @param {boolean} disabled
 * @param {React.ReactNode} iconLeft
 * @param {React.ReactNode} iconRight
 */
export default function BfaButton({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  iconLeft = null,
  iconRight = null,
  className = '',
  type = 'button',
  onClick,
  ...rest
}) {
  const classNames = [
    'bfa-lux-btn',
    `bfa-lux-btn--${variant}`,
    `bfa-lux-btn--${size}`,
    isLoading ? 'bfa-lux-btn--loading' : '',
    disabled ? 'bfa-lux-btn--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classNames}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      onClick={onClick}
      {...rest}
    >
      {isLoading && (
        <span className="bfa-lux-btn-spinner" aria-hidden="true" />
      )}
      {!isLoading && iconLeft && (
        <span className="bfa-lux-btn-icon bfa-lux-btn-icon--left">{iconLeft}</span>
      )}
      <span className="bfa-lux-btn-label">{children}</span>
      {!isLoading && iconRight && (
        <span className="bfa-lux-btn-icon bfa-lux-btn-icon--right">{iconRight}</span>
      )}
    </button>
  );
}

