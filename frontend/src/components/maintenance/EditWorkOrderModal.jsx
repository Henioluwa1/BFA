import React, { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { maintenanceService } from '../../services/api';
import { useToast } from '../../context/ToastContext';

const categories = ['PLUMBING', 'ELECTRICAL', 'HVAC', 'CARPENTRY', 'APPLIANCE', 'PAINTING', 'CLEANING', 'GENERAL'];
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export default function EditWorkOrderModal({ isOpen, onClose, workOrder, onSuccess }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    issue_title: '',
    description: '',
    category: 'GENERAL',
    priority: 'MEDIUM',
    estimated_cost: '0',
    blocking_unit: false,
  });

  useEffect(() => {
    if (!workOrder) return;
    setForm({
      issue_title: workOrder.issue_title || '',
      description: workOrder.description || '',
      category: workOrder.category || 'GENERAL',
      priority: workOrder.priority || 'MEDIUM',
      estimated_cost: String(workOrder.estimated_cost ?? 0),
      blocking_unit: workOrder.blocking_unit === true || workOrder.blocking_unit === 1 || workOrder.blocking_unit === '1',
    });
  }, [workOrder, isOpen]);

  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    const estimatedCost = Number(form.estimated_cost);
    if (!form.issue_title.trim()) {
      addToast('Issue title is required.', 'error');
      return;
    }
    if (!Number.isFinite(estimatedCost) || estimatedCost < 0) {
      addToast('Estimated cost must be a valid non-negative number.', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await maintenanceService.update(workOrder.id, {
        issue_title: form.issue_title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        priority: form.priority,
        estimated_cost: estimatedCost,
        blocking_unit: form.priority === 'CRITICAL' ? true : form.blocking_unit,
      });
      addToast(`Work order ${workOrder.issue_code} updated.`, 'success');
      onSuccess?.(response.data);
      onClose();
    } catch (error) {
      addToast(`Failed to update work order: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!workOrder) return null;

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '0.6rem', marginTop: '0.25rem',
    borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)',
    background: 'var(--bg-surface)', color: 'var(--text-primary)',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { if (!loading) onClose(); }}
      title={`Edit Work Order: ${workOrder.issue_code}`}
      maxWidth="620px"
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', width: '100%', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={loading}>
            {loading ? 'Saving Changes...' : 'Save Changes'}
          </Button>
        </div>
      )}
    >
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '0.9rem' }}>
        <label style={{ gridColumn: '1 / -1' }}>
          Issue title *
          <input style={inputStyle} maxLength={255} required value={form.issue_title} onChange={(event) => change('issue_title', event.target.value)} />
        </label>
        <label>
          Category
          <select style={inputStyle} value={form.category} onChange={(event) => change('category', event.target.value)}>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <label>
          Priority
          <select style={inputStyle} value={form.priority} onChange={(event) => change('priority', event.target.value)}>
            {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
          </select>
        </label>
        <label>
          Estimated cost (₦)
          <input style={inputStyle} type="number" min="0" step="0.01" value={form.estimated_cost} onChange={(event) => change('estimated_cost', event.target.value)} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.6rem' }}>
          <input type="checkbox" checked={form.priority === 'CRITICAL' || form.blocking_unit} disabled={form.priority === 'CRITICAL'} onChange={(event) => change('blocking_unit', event.target.checked)} />
          Blocks unit availability
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          Description
          <textarea style={{ ...inputStyle, minHeight: '96px', resize: 'vertical' }} maxLength={5000} value={form.description} onChange={(event) => change('description', event.target.value)} />
        </label>
      </form>
    </Modal>
  );
}
