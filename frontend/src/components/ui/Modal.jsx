import React, { useEffect, useRef, useId } from 'react';

/**
 * Enterprise Modal Component for BFA Apartments Management System
 * Standardized across all 26+ operational modals.
 * Supports:
 * - Size variants: sm (420px), md (560px), lg (720px), xl (960px), full (viewport)
 * - Accessible Focus Trap & Restoration
 * - Mobile bottom-sheet & full-screen responsive behaviors
 * - Subcomponents: Modal.Header, Modal.Body, Modal.Footer, Modal.Section, Modal.FieldGroup
 * - Standalone ConfirmationModal for destructive / high-risk operations
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  description,
  icon,
  size = 'md',
  preventBackdropClose = false,
  preventEscapeClose = false,
  children,
  footer,
  className = '',
  bodyClassName = '',
  ariaLabel,
}) {
  const modalRef = useRef(null);
  const previousActiveElement = useRef(null);
  const titleId = useId();
  const descId = useId();

  const sub = subtitle || description;

  // Manage body scroll and focus trapping
  useEffect(() => {
    if (!isOpen) return;

    // Capture element that had focus before modal opened
    previousActiveElement.current = document.activeElement;
    document.body.style.overflow = 'hidden';

    // Auto-focus the first focusable element inside the modal or the modal container
    const focusTimer = setTimeout(() => {
      if (modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          // If the first focusable is the close button and there's an input, prefer the first input
          const firstInput = Array.from(focusable).find(
            (el) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) && !el.disabled
          );
          if (firstInput) {
            firstInput.focus();
          } else {
            focusable[0].focus();
          }
        } else {
          modalRef.current.focus();
        }
      }
    }, 50);

    const handleKeyDown = (e) => {
      // Escape key
      if (e.key === 'Escape' && !preventEscapeClose) {
        e.stopPropagation();
        onClose?.();
        return;
      }

      // Focus trap on Tab
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = Array.from(
          modalRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );

        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || document.activeElement === modalRef.current) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(focusTimer);

      // Restore focus
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        try {
          previousActiveElement.current.focus();
        } catch (_) {}
      }
    };
  }, [isOpen, onClose, preventEscapeClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !preventBackdropClose) {
      onClose?.();
    }
  };

  const sizeClass = `modal-${size}`;

  return (
    <div
      className="modal-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={sub ? descId : undefined}
      aria-label={!title ? ariaLabel || 'Dialog Window' : undefined}
    >
      <div
        ref={modalRef}
        className={`modal-content ${sizeClass} ${className}`}
        tabIndex="-1"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Render standardized header if title or icon provided */}
        {(title || icon) && (
          <div className="modal-header">
            <div className="modal-header-text">
              <div className="modal-title-row">
                {icon && <span className="modal-header-icon">{icon}</span>}
                <h3 id={titleId} className="modal-title">
                  {title}
                </h3>
              </div>
              {sub && (
                <p id={descId} className="modal-subtitle">
                  {sub}
                </p>
              )}
            </div>
            {onClose && (
              <button
                type="button"
                className="modal-close-btn"
                onClick={onClose}
                aria-label="Close modal"
                title="Close modal (Esc)"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Modal Body */}
        <div className={`modal-body ${bodyClassName}`}>{children}</div>

        {/* Modal Footer */}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// Subcomponents for structured modular composition
Modal.Header = function ModalHeader({ title, subtitle, icon, onClose, children }) {
  return (
    <div className="modal-header">
      <div className="modal-header-text">
        <div className="modal-title-row">
          {icon && <span className="modal-header-icon">{icon}</span>}
          {title && <h3 className="modal-title">{title}</h3>}
        </div>
        {subtitle && <p className="modal-subtitle">{subtitle}</p>}
        {children}
      </div>
      {onClose && (
        <button
          type="button"
          className="modal-close-btn"
          onClick={onClose}
          aria-label="Close modal"
          title="Close modal (Esc)"
        >
          ✕
        </button>
      )}
    </div>
  );
};

Modal.Body = function ModalBody({ children, className = '', noPadding = false }) {
  return (
    <div
      className={`modal-body ${className}`}
      style={noPadding ? { padding: 0 } : undefined}
    >
      {children}
    </div>
  );
};

Modal.Footer = function ModalFooter({ children, className = '', align = 'right' }) {
  const justify =
    align === 'between'
      ? 'space-between'
      : align === 'left'
      ? 'flex-start'
      : align === 'center'
      ? 'center'
      : 'flex-end';

  return (
    <div className={`modal-footer ${className}`} style={{ justifyContent: justify }}>
      {children}
    </div>
  );
};

Modal.Section = function ModalSection({ title, description, children, style = {} }) {
  return (
    <div className="modal-section" style={style}>
      {(title || description) && (
        <div className="modal-section-header">
          {title && <h4 className="modal-section-title">{title}</h4>}
          {description && <p className="modal-section-desc">{description}</p>}
        </div>
      )}
      <div className="modal-section-content">{children}</div>
    </div>
  );
};

Modal.FieldGroup = function ModalFieldGroup({ children, columns = 2, style = {} }) {
  return (
    <div
      className="modal-field-group"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${columns > 1 ? '240px' : '100%'}), 1fr))`,
        gap: '1rem',
        marginBottom: '1rem',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/**
 * Standardized Confirmation & Destructive Action Modal
 */
export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  subtitle,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'danger',
  loading = false,
  requiresKeyword = false,
  confirmKeyword = '',
  icon,
  details,
}) {
  const [enteredKeyword, setEnteredKeyword] = React.useState('');

  useEffect(() => {
    if (!isOpen) {
      setEnteredKeyword('');
    }
  }, [isOpen]);

  const isConfirmed = !requiresKeyword || enteredKeyword.trim() === confirmKeyword.trim();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title={title}
      subtitle={subtitle}
      icon={icon || (confirmVariant === 'danger' ? '⚠️' : 'ℹ️')}
      preventBackdropClose={true}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {message && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
            {message}
          </p>
        )}

        {details && (
          <div
            style={{
              padding: '0.85rem',
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.84rem',
            }}
          >
            {details}
          </div>
        )}

        {requiresKeyword && (
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '0.35rem',
              }}
            >
              Type <strong style={{ color: 'var(--brand-accent)' }}>{confirmKeyword}</strong> to confirm:
            </label>
            <input
              type="text"
              className="form-control"
              value={enteredKeyword}
              onChange={(e) => setEnteredKeyword(e.target.value)}
              placeholder={confirmKeyword}
              style={{ width: '100%', fontFamily: 'monospace' }}
              disabled={loading}
              autoFocus
            />
          </div>
        )}
      </div>

      <div className="modal-footer" style={{ marginTop: '1.5rem', padding: '1rem 0 0 0', borderTop: '1px solid var(--border-subtle)' }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onClose}
          disabled={loading}
        >
          {cancelText}
        </button>
        <button
          type="button"
          className={`btn btn-${confirmVariant}`}
          onClick={onConfirm}
          disabled={!isConfirmed || loading}
        >
          {loading ? 'Processing...' : confirmText}
        </button>
      </div>
    </Modal>
  );
}
