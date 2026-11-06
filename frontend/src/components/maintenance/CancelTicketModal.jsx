import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { maintenanceService } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export default function CancelTicketModal({
  isOpen,
  onClose,
  workOrder,
  onSuccess,
}) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      addToast('A cancellation reason is required.', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await maintenanceService.cancel(workOrder.id, {
        reason: reason.trim(),
      });
      addToast(`Work order #${workOrder.issue_code} cancelled.`, 'info');
      if (onSuccess) onSuccess(res.data);
      onClose();
    } catch (err) {
      addToast(`Failed to cancel work order: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!workOrder) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Cancel Work Order: ${workOrder.issue_code}`}
      maxWidth="500px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Abort
          </Button>
          <Button variant="danger" onClick={handleSubmit} disabled={loading || !reason.trim()}>
            {loading ? 'Cancelling...' : 'Confirm Cancellation'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div
          style={{
            background: 'var(--bg-surface)',
            padding: '0.85rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)',
            fontSize: '0.85rem',
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{workOrder.issue_title}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Property: <strong>{workOrder.property_name}</strong> • Unit:{' '}
            <strong>{workOrder.unit_number ? `Unit ${workOrder.unit_number}` : 'Common Area'}</strong>
          </div>
        </div>

        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Cancellation Reason *
          </label>
          <textarea
            rows={3}
            required
            placeholder="e.g., Duplicate ticket logged, work rendered unnecessary by unit upgrade, logged under wrong property..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{
              width: '100%',
              maxWidth: '100%',
              padding: '0.55rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
              resize: 'vertical',
              marginTop: '0.25rem',
            }}
          />
        </div>

        <div
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            padding: '0.75rem 0.9rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.45,
          }}
        >
          ⚠️ <strong>Unit Status Clearance:</strong> If this work order was locking Unit{' '}
          <strong>{workOrder.unit_number || ''}</strong> in <code>MAINTENANCE</code> and no other blocking tickets remain,
          cancelling this ticket will automatically clear the maintenance restriction on the unit.
        </div>
      </form>
    </Modal>
  );
}

