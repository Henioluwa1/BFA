import React from 'react';
import useAuthenticatedImage from '../../hooks/useAuthenticatedImage';

/**
 * AuthenticatedImage Component
 *
 * Renders an image streamed securely through useAuthenticatedImage,
 * displaying standard loading skeleton/spinner, empty fallback, and error state with retry.
 */
export default function AuthenticatedImage({
  workOrderId,
  evidenceId,
  alt = 'Evidence photo',
  className = '',
  style = {},
  thumbnailStyle = {},
  onClick,
}) {
  const { imageUrl, loading, error, retry } = useAuthenticatedImage(workOrderId, evidenceId);

  if (loading) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-surface, #f3f4f6)',
          color: 'var(--text-muted, #9ca3af)',
          fontSize: '0.75rem',
          minHeight: '120px',
          borderRadius: 'var(--radius-sm, 6px)',
          border: '1px dashed var(--border-default, #e5e7eb)',
          ...thumbnailStyle,
          ...style,
        }}
      >
        <span style={{ display: 'inline-block' }}>⏳</span>
        <span style={{ marginLeft: '0.4rem' }}>Loading image...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(239, 68, 68, 0.05)',
          color: 'var(--color-danger, #ef4444)',
          fontSize: '0.75rem',
          padding: '0.5rem',
          minHeight: '120px',
          borderRadius: 'var(--radius-sm, 6px)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          textAlign: 'center',
          ...thumbnailStyle,
          ...style,
        }}
      >
        <span>⚠️ Preview unavailable</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            retry();
          }}
          style={{
            marginTop: '0.35rem',
            background: 'transparent',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: 'var(--color-danger, #ef4444)',
            borderRadius: '4px',
            fontSize: '0.7rem',
            padding: '0.2rem 0.5rem',
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-surface, #f3f4f6)',
          color: 'var(--text-muted, #9ca3af)',
          fontSize: '0.75rem',
          minHeight: '120px',
          borderRadius: 'var(--radius-sm, 6px)',
          ...thumbnailStyle,
          ...style,
        }}
      >
        No photo available
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={className}
      onClick={onClick}
      style={{
        objectFit: 'cover',
        cursor: onClick ? 'pointer' : 'default',
        borderRadius: 'var(--radius-sm, 6px)',
        display: 'block',
        ...thumbnailStyle,
        ...style,
      }}
    />
  );
}

