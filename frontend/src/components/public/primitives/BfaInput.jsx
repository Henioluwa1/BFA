import React from 'react';
import './BfaInput.css';

/**
 * BfaInput - Accessible Hospitality Form Control Primitive
 */
export default function BfaInput({
  label,
  id,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  errorUrgent = false,
  helperText,
  required = false,
  disabled = false,
  iconLeft,
  iconRight,
  as = 'input',
  options = [],
  children,
  className = '',
  ...rest
}) {
  const inputId = id || `bfa-input-${Math.random().toString(36).substr(2, 9)}`;
  const hasError = Boolean(error);

  const wrapperClasses = [
    'bfa-lux-field',
    hasError ? 'bfa-lux-field--error' : '',
    disabled ? 'bfa-lux-field--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapperClasses}>
      {label && (
        <label htmlFor={inputId} className="bfa-lux-field-label">
          {label}
          {required && <span className="bfa-lux-field-required" aria-hidden="true"> *</span>}
        </label>
      )}

      <div className="bfa-lux-input-wrapper">
        {iconLeft && (
          <span className="bfa-lux-input-affix bfa-lux-input-affix--left" aria-hidden="true">
            {iconLeft}
          </span>
        )}

        {as === 'select' ? (
          <select
            id={inputId}
            value={value}
            onChange={onChange}
            disabled={disabled}
            required={required}
            aria-invalid={hasError}
            aria-describedby={hasError ? `${inputId}-error` : helperText ? `${inputId}-help` : undefined}
            className={`bfa-lux-input bfa-lux-select ${iconLeft ? 'bfa-lux-input--has-left' : ''}`}
            {...rest}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
            {children}
          </select>
        ) : as === 'textarea' ? (
          <textarea
            id={inputId}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            aria-invalid={hasError}
            aria-describedby={hasError ? `${inputId}-error` : helperText ? `${inputId}-help` : undefined}
            className="bfa-lux-input bfa-lux-textarea"
            {...rest}
          />
        ) : (
          <input
            id={inputId}
            type={type}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            aria-invalid={hasError}
            aria-describedby={hasError ? `${inputId}-error` : helperText ? `${inputId}-help` : undefined}
            className={`bfa-lux-input ${iconLeft ? 'bfa-lux-input--has-left' : ''} ${iconRight ? 'bfa-lux-input--has-right' : ''}`}
            {...rest}
          />
        )}

        {iconRight && (
          <span className="bfa-lux-input-affix bfa-lux-input-affix--right" aria-hidden="true">
            {iconRight}
          </span>
        )}
      </div>

      {hasError && (
        <span
          id={`${inputId}-error`}
          className="bfa-lux-field-error"
          role={errorUrgent ? 'alert' : 'status'}
          aria-live={errorUrgent ? 'assertive' : 'polite'}
        >
          {error}
        </span>
      )}

      {!hasError && helperText && (
        <span id={`${inputId}-help`} className="bfa-lux-field-helper">
          {helperText}
        </span>
      )}
    </div>
  );
}

