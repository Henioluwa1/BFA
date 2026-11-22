import React, { useState } from 'react';
import { FileText, Download, CheckCircle2, AlertTriangle, ArrowRight, Check } from 'lucide-react';
import api, { centralOperationsService } from '../../services/api';
import { useToast } from '../../context/ToastContext';

/**
 * Interactive Operation Memo Card inside Chat Message Stream
 * 100% Dark Glass / Black Glass styling with pure white text and zero navy blue.
 * Features unambiguous next action guidance and instant in-chat actions.
 */
export default function OperationChatCard({
  operationId,
  memoRef,
  priority = 'NORMAL',
  title,
  currentUser,
  onViewOperation,
  onOperationUpdated,
}) {
  const { addToast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const handleDownloadPdf = async (e) => {
    e.stopPropagation();
    if (!operationId) return;
    setDownloading(true);
    try {
      await centralOperationsService.downloadMemoPdf({
        operationId,
        filename: `${memoRef || `Operation_${operationId}`}.pdf`,
      });
      addToast('Operations Memorandum PDF downloaded successfully.', 'success');
    } catch (err) {
      console.error('[CARD] PDF download failed:', err);
      addToast(err.message || 'Failed to download PDF memorandum.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const handleQuickAcknowledge = async (e) => {
    e.stopPropagation();
    if (!operationId) return;
    setAcknowledging(true);
    try {
      await api.post(`/workforce/operations/${operationId}/acknowledge`, {
        note: 'Acknowledged directly via chat message card.',
      });
      setAcknowledged(true);
      addToast('Operation receipt formally acknowledged.', 'success');
      onOperationUpdated?.();
    } catch (err) {
      console.error('[CARD] Acknowledge failed:', err);
      addToast(err.response?.data?.message || err.message || 'Failed to acknowledge.', 'error');
    } finally {
      setAcknowledging(false);
    }
  };

  const prioBadge = {
    CRITICAL: {
      text: '🚨 CRITICAL DIRECTIVE',
      bg: 'rgba(220, 38, 38, 0.25)',
      color: '#f87171',
      border: '#ef4444',
    },
    URGENT: {
      text: '⚡ URGENT DIRECTIVE',
      bg: 'rgba(245, 158, 11, 0.25)',
      color: '#fbbf24',
      border: '#f59e0b',
    },
    IMPORTANT: {
      text: '⚠️ IMPORTANT DIRECTIVE',
      bg: 'rgba(245, 158, 11, 0.2)',
      color: '#fbbf24',
      border: '#f59e0b',
    },
    NORMAL: {
      text: '📋 OFFICIAL DIRECTIVE',
      bg: 'rgba(59, 130, 246, 0.2)',
      color: '#60a5fa',
      border: '#3b82f6',
    },
  }[priority] || {
    text: '📋 OFFICIAL DIRECTIVE',
    bg: 'rgba(59, 130, 246, 0.2)',
    color: '#60a5fa',
    border: '#3b82f6',
  };

  return (
    <div
      style={{
        marginTop: '8px',
        padding: '12px 14px',
        borderRadius: '10px',
        background: 'rgba(10, 10, 14, 0.90)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        color: '#ffffff',
      }}
    >
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontSize: '0.68rem',
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: '4px',
            background: prioBadge.bg,
            color: prioBadge.color,
            border: `1px solid ${prioBadge.border}`,
            letterSpacing: '0.4px',
          }}
        >
          {prioBadge.text}
        </span>
        {memoRef && (
          <span
            style={{
              fontSize: '0.7rem',
              color: 'rgba(255, 255, 255, 0.7)',
              fontFamily: 'monospace',
            }}
          >
            {memoRef}
          </span>
        )}
      </div>

      {/* Operation Title / Subject */}
      {title && (
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.35 }}>
          {title}
        </div>
      )}

      {/* Unambiguous Next Action Banner */}
      <div
        style={{
          padding: '6px 10px',
          borderRadius: '6px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderLeft: '3px solid #3b82f6',
          fontSize: '0.74rem',
          color: 'rgba(255, 255, 255, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>
          <strong>Next Action:</strong> Review instructions, acknowledge receipt & execute assigned mandates.
        </span>
      </div>

      {/* Action Buttons Row */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
        <button
          type="button"
          onClick={() => onViewOperation?.(operationId)}
          style={{
            fontSize: '0.74rem',
            padding: '5px 12px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            border: 'none',
            color: '#ffffff',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
          }}
        >
          <FileText size={13} /> View Directive & Tasks
        </button>

        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={downloading}
          style={{
            fontSize: '0.74rem',
            padding: '5px 10px',
            borderRadius: '6px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            color: '#ffffff',
            fontWeight: 600,
            cursor: downloading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <Download size={13} /> {downloading ? 'Downloading...' : 'PDF'}
        </button>

        {!acknowledged && (
          <button
            type="button"
            onClick={handleQuickAcknowledge}
            disabled={acknowledging}
            style={{
              fontSize: '0.74rem',
              padding: '5px 10px',
              borderRadius: '6px',
              background: 'rgba(16, 185, 129, 0.18)',
              border: '1px solid #10b981',
              color: '#34d399',
              fontWeight: 700,
              cursor: acknowledging ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Check size={13} /> {acknowledging ? '...' : 'Acknowledge'}
          </button>
        )}
      </div>
    </div>
  );
}
