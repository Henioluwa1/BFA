import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Building2,
  User,
  ShieldCheck,
  Send,
  Calendar,
  Eye,
  Check,
} from 'lucide-react';
import api, { centralOperationsService } from '../../services/api';
import { useToast } from '../../context/ToastContext';

/**
 * In-Chat Operation Details & Official Memo Viewer Modal
 * 100% Dark Glass / Black Glass design with crisp pure white typography.
 * Displays unambiguous next actions, complete memorandum text, task tracker, and PDF download.
 */
export default function InChatOperationDetailsModal({
  isOpen,
  onClose,
  operationId,
  currentUser,
  onOperationUpdated,
}) {
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [progressNote, setProgressNote] = useState('');
  const [progressPercent, setProgressPercent] = useState(50);
  const [submittingProgress, setSubmittingProgress] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  // Load Operation Record
  const fetchOperation = async () => {
    if (!operationId) return;
    setLoading(true);
    try {
      const res = await api.get(`/workforce/operations/${operationId}`);
      const data = res.data || res;
      setOperation(data);
      if (data.tasks && data.tasks.length > 0 && !selectedTaskId) {
        setSelectedTaskId(data.tasks[0].id);
      }
    } catch (err) {
      console.error('[IN_CHAT_MEMO] Failed to fetch operation:', err);
      addToast('Failed to load operation details.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && operationId) {
      fetchOperation();
    }
  }, [isOpen, operationId]);

  if (!isOpen) return null;

  // Acknowledge Receipt
  const handleAcknowledge = async () => {
    if (!operationId) return;
    setAcknowledging(true);
    try {
      await api.post(`/workforce/operations/${operationId}/acknowledge`, {
        note: 'Acknowledged directly from Staff Chat',
      });
      addToast('Directive receipt acknowledged successfully.', 'success');
      await fetchOperation();
      onOperationUpdated?.();
    } catch (err) {
      console.error('[IN_CHAT_MEMO] Acknowledge error:', err);
      addToast(err.response?.data?.message || err.message || 'Failed to acknowledge receipt.', 'error');
    } finally {
      setAcknowledging(false);
    }
  };

  // Download PDF Memorandum
  const handleDownloadPdf = async () => {
    if (!operationId) return;
    setDownloadingPdf(true);
    try {
      await centralOperationsService.downloadMemoPdf({
        operationId,
        memoId: operation?.latest_memo?.id,
        filename: `${operation?.latest_memo?.memo_reference || operation?.operation_code || 'Operation_Memo'}.pdf`,
      });
      addToast('Operations Memorandum PDF downloaded successfully.', 'success');
    } catch (err) {
      console.error('[IN_CHAT_MEMO] PDF download failed:', err);
      addToast(err.message || 'Failed to download Operations Memorandum PDF.', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Submit Task Progress
  const handleSubmitProgress = async (e) => {
    e.preventDefault();
    if (!selectedTaskId || !progressNote.trim()) {
      addToast('Please select a task and describe progress achieved.', 'warning');
      return;
    }
    setSubmittingProgress(true);
    try {
      await api.post(`/workforce/operations/${operationId}/progress`, {
        taskId: selectedTaskId,
        note: progressNote.trim(),
        progressPercent: parseInt(progressPercent, 10),
      });
      addToast('Operational progress update submitted.', 'success');
      setProgressNote('');
      await fetchOperation();
      onOperationUpdated?.();
    } catch (err) {
      console.error('[IN_CHAT_MEMO] Progress error:', err);
      addToast(err.response?.data?.message || err.message || 'Failed to submit progress.', 'error');
    } finally {
      setSubmittingProgress(false);
    }
  };

  const memo = operation?.latest_memo || {};
  const isInitiator = Number(currentUser?.id) === Number(operation?.initiated_by_user_id);
  const myRecipientRecord = operation?.recipients?.find(
    (r) => Number(r.user_id) === Number(currentUser?.id)
  );
  const isRecipient = Boolean(myRecipientRecord);
  const isAcknowledged = myRecipientRecord?.acknowledged_at !== null && myRecipientRecord?.acknowledged_at !== undefined;

  // Derive Unambiguous Next Action
  let nextActionBanner = null;
  if (operation?.status === 'COMPLETED') {
    nextActionBanner = {
      type: 'completed',
      title: '✓ Operation Completed & Audited',
      desc: 'All operational mandates have been verified and closed by authorized supervisors.',
      bg: 'rgba(16, 185, 129, 0.15)',
      border: 'rgba(16, 185, 129, 0.4)',
      color: '#34d399',
    };
  } else if (isRecipient && !isAcknowledged) {
    nextActionBanner = {
      type: 'action_required',
      title: '⚡ Immediate Next Action Required: Acknowledge Receipt',
      desc: 'Company governance requires all designated recipients to formally acknowledge directives upon receipt.',
      bg: 'rgba(239, 68, 68, 0.18)',
      border: 'rgba(239, 68, 68, 0.45)',
      color: '#f87171',
    };
  } else if (operation?.status === 'IN_PROGRESS' || operation?.status === 'ISSUED') {
    nextActionBanner = {
      type: 'in_progress',
      title: '📋 Current Operational Step: Execution & Reporting',
      desc: 'Carry out the operational instructions below and submit verified progress notes.',
      bg: 'rgba(59, 130, 246, 0.15)',
      border: 'rgba(59, 130, 246, 0.4)',
      color: '#60a5fa',
    };
  } else if (operation?.status === 'AWAITING_REVIEW') {
    nextActionBanner = {
      type: 'review',
      title: '🔍 Current Operational Step: Supervisory Verification & Sign-Off',
      desc: 'Execution has been reported. Awaiting initiator or property manager sign-off.',
      bg: 'rgba(245, 158, 11, 0.15)',
      border: 'rgba(245, 158, 11, 0.4)',
      color: '#fbbf24',
    };
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1050,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'modalFadeIn 180ms ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '820px',
          maxHeight: '92vh',
          background: 'rgba(10, 10, 14, 0.95)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          border: '1.5px solid rgba(255, 255, 255, 0.18)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.95), 0 0 30px rgba(59, 130, 246, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#ffffff',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
            background: 'rgba(255, 255, 255, 0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(212, 175, 55, 0.15)',
                border: '1.5px solid rgba(212, 175, 55, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fbbf24',
              }}
            >
              <FileText size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#ffffff' }}>
                  {operation?.operation_code || 'Central Operation Record'}
                </h3>
                {memo.memo_reference && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.18)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      color: 'rgba(255, 255, 255, 0.85)',
                      fontFamily: 'monospace',
                    }}
                  >
                    {memo.memo_reference}
                  </span>
                )}
                {operation?.priority && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background:
                        operation.priority === 'CRITICAL'
                          ? 'rgba(220, 38, 38, 0.25)'
                          : operation.priority === 'URGENT'
                          ? 'rgba(245, 158, 11, 0.25)'
                          : 'rgba(59, 130, 246, 0.25)',
                      color:
                        operation.priority === 'CRITICAL'
                          ? '#f87171'
                          : operation.priority === 'URGENT'
                          ? '#fbbf24'
                          : '#60a5fa',
                      border: `1px solid ${
                        operation.priority === 'CRITICAL'
                          ? '#ef4444'
                          : operation.priority === 'URGENT'
                          ? '#f59e0b'
                          : '#3b82f6'
                      }`,
                    }}
                  >
                    {operation.priority}
                  </span>
                )}
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.70)' }}>
                {operation?.title || 'Loading operational directive...'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf || loading}
              style={{
                background: 'rgba(59, 130, 246, 0.18)',
                border: '1px solid #3b82f6',
                color: '#60a5fa',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: downloadingPdf ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s',
              }}
              title="Download Official PDF Memorandum"
            >
              <Download size={14} />
              {downloadingPdf ? 'Downloading PDF...' : 'Download PDF Memo'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.7)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255, 255, 255, 0.7)' }}>
              Loading operational memorandum and action items...
            </div>
          )}

          {!loading && operation && (
            <>
              {/* Unambiguous Next Action Banner */}
              {nextActionBanner && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    background: nextActionBanner.bg,
                    border: `1.5px solid ${nextActionBanner.border}`,
                    color: '#ffffff',
                    marginBottom: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.88rem', color: nextActionBanner.color }}>
                      {nextActionBanner.title}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.85)', marginTop: '2px' }}>
                      {nextActionBanner.desc}
                    </div>
                  </div>

                  {isRecipient && !isAcknowledged && (
                    <button
                      type="button"
                      onClick={handleAcknowledge}
                      disabled={acknowledging}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '6px',
                        background: '#10b981',
                        border: 'none',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        cursor: acknowledging ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexShrink: 0,
                      }}
                    >
                      <Check size={14} />
                      {acknowledging ? 'Acknowledging...' : 'Acknowledge Now'}
                    </button>
                  )}
                </div>
              )}

              {/* Metadata Quick Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '12px',
                  padding: '14px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  marginBottom: '18px',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 600 }}>ISSUED BY</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff', marginTop: '2px' }}>
                    {operation.initiator_name || 'Authorised Officer'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 600 }}>TARGET AUDIENCE</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff', marginTop: '2px' }}>
                    {memo.recipient_summary || operation.target_audience_type}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 600 }}>PROPERTY SCOPE</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff', marginTop: '2px' }}>
                    {memo.property_scope_summary || 'Corporate / Multi-Property'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 600 }}>DEADLINE</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fbbf24', marginTop: '2px' }}>
                    {memo.deadline_text || 'Standard Timeline'}
                  </div>
                </div>
              </div>

              {/* Subject Banner */}
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  borderLeft: '4px solid #3b82f6',
                  marginBottom: '18px',
                }}
              >
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase' }}>
                  SUBJECT:
                </span>{' '}
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff' }}>
                  {memo.subject || operation.subject}
                </span>
              </div>

              {/* Structured Sections */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 1. Purpose */}
                <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#60a5fa', marginBottom: '6px', textTransform: 'uppercase' }}>
                    1. Purpose & Executive Rationale
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#ffffff', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {memo.purpose || operation.purpose}
                  </div>
                </div>

                {/* 2. Instructions */}
                <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#60a5fa', marginBottom: '6px', textTransform: 'uppercase' }}>
                    2. Operational Instructions & Directives
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#ffffff', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {memo.operational_instructions || operation.operational_instructions}
                  </div>
                </div>

                {/* 3. Expected Outcome */}
                {(memo.expected_outcome || operation.expected_outcome) && (
                  <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#60a5fa', marginBottom: '6px', textTransform: 'uppercase' }}>
                      3. Expected Outcome & Key Deliverables
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#ffffff', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {memo.expected_outcome || operation.expected_outcome}
                    </div>
                  </div>
                )}

                {/* 4. Accountability */}
                {(memo.responsibility_definition || operation.responsibility_definition) && (
                  <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#60a5fa', marginBottom: '6px', textTransform: 'uppercase' }}>
                      4. Accountability Matrix
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#ffffff', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {memo.responsibility_definition || operation.responsibility_definition}
                    </div>
                  </div>
                )}

                {/* 5. Reporting Procedures */}
                {(memo.reporting_requirements || operation.reporting_requirements) && (
                  <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#60a5fa', marginBottom: '6px', textTransform: 'uppercase' }}>
                      5. Reporting Requirements & Verification
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#ffffff', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {memo.reporting_requirements || operation.reporting_requirements}
                    </div>
                  </div>
                )}
              </div>

              {/* Linked Operational Tasks & Progress Section */}
              {operation.tasks && operation.tasks.length > 0 && (
                <div style={{ marginTop: '22px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffffff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Layers size={16} style={{ color: '#60a5fa' }} />
                    Linked Operational Tasks ({operation.tasks.length})
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                    {operation.tasks.map((t) => (
                      <div
                        key={t.id}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#ffffff' }}>
                            {t.title}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.65)', marginTop: '2px' }}>
                            Assigned to: {t.assigned_to_name || 'Operational Staff'} · Status: {t.status}
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background:
                              t.status === 'COMPLETED'
                                ? 'rgba(16, 185, 129, 0.2)'
                                : 'rgba(59, 130, 246, 0.2)',
                            color: t.status === 'COMPLETED' ? '#34d399' : '#60a5fa',
                            border: `1px solid ${
                              t.status === 'COMPLETED' ? '#10b981' : '#3b82f6'
                            }`,
                          }}
                        >
                          {t.status}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Task Progress Submission Form (for assigned staff / performers) */}
                  {operation.status !== 'COMPLETED' && (
                    <form
                      onSubmit={handleSubmitProgress}
                      style={{
                        padding: '14px',
                        borderRadius: '10px',
                        background: 'rgba(0, 0, 0, 0.45)',
                        border: '1px solid rgba(255, 255, 255, 0.16)',
                      }}
                    >
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                        Submit Verified Task Progress Note
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '8px' }}>
                        <select
                          value={selectedTaskId || ''}
                          onChange={(e) => setSelectedTaskId(e.target.value)}
                          style={{
                            padding: '8px 10px',
                            background: 'rgba(0, 0, 0, 0.6)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '6px',
                            color: '#ffffff',
                            fontSize: '0.8rem',
                          }}
                        >
                          {operation.tasks.map((t) => (
                            <option key={t.id} value={t.id} style={{ background: '#0a0a0e', color: '#fff' }}>
                              Task: {t.title} ({t.status})
                            </option>
                          ))}
                        </select>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.7)' }}>Progress:</span>
                          <input
                            type="number"
                            min="10"
                            max="100"
                            step="10"
                            value={progressPercent}
                            onChange={(e) => setProgressPercent(e.target.value)}
                            style={{
                              width: '60px',
                              padding: '6px 8px',
                              background: 'rgba(0, 0, 0, 0.6)',
                              border: '1px solid rgba(255, 255, 255, 0.2)',
                              borderRadius: '6px',
                              color: '#ffffff',
                              fontSize: '0.8rem',
                              textAlign: 'center',
                            }}
                          />
                          <span style={{ fontSize: '0.75rem', color: '#ffffff' }}>%</span>
                        </div>
                      </div>

                      <textarea
                        rows={2}
                        value={progressNote}
                        onChange={(e) => setProgressNote(e.target.value)}
                        placeholder="Detail progress accomplished, tests run, or verification evidence..."
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: 'rgba(0, 0, 0, 0.6)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: '6px',
                          color: '#ffffff',
                          fontSize: '0.8rem',
                          boxSizing: 'border-box',
                          resize: 'vertical',
                          marginBottom: '8px',
                        }}
                      />

                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="submit"
                          disabled={submittingProgress}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            background: '#2563eb',
                            border: 'none',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            cursor: submittingProgress ? 'wait' : 'pointer',
                          }}
                        >
                          {submittingProgress ? 'Submitting...' : 'Submit Progress Update'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 22px',
            borderTop: '1px solid rgba(255, 255, 255, 0.12)',
            background: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isRecipient && (
              <span
                style={{
                  fontSize: '0.75rem',
                  color: isAcknowledged ? '#34d399' : '#f87171',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 600,
                }}
              >
                {isAcknowledged ? '✓ You acknowledged this memo' : '⚠️ Awaiting your acknowledgement'}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf || loading}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid #3b82f6',
                color: '#60a5fa',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Download size={14} /> Download PDF
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                color: '#ffffff',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
