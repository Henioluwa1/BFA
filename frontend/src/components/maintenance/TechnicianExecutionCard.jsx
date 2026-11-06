import React from 'react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { formatNaira } from '../../utils/currency';

export default function TechnicianExecutionCard({
  workOrder,
  onOpenDetail,
  onStartWork,
  onOpenResolve,
  onOpenEvidence,
  actionLoading = false,
  isAssignedToCurrentUser = false,
}) {
  if (!workOrder) return null;

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'CRITICAL':
        return '#ef4444';
      case 'HIGH':
        return '#f97316';
      case 'MEDIUM':
        return '#eab308';
      case 'LOW':
        return '#10b981';
      default:
        return 'var(--text-secondary)';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'OPEN':
        return <Badge status="danger">OPEN</Badge>;
      case 'IN_PROGRESS':
        return <Badge status="pending">IN PROGRESS</Badge>;
      case 'RESOLVED':
        return <Badge status="success">RESOLVED</Badge>;
      case 'CANCELLED':
        return <Badge status="secondary">CANCELLED</Badge>;
      default:
        return <Badge status="neutral">{status}</Badge>;
    }
  };

  const handleEvidenceClick = () => {
    if (onOpenEvidence) {
      onOpenEvidence(workOrder);
    } else if (onOpenDetail) {
      onOpenDetail(workOrder);
    }
  };

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${workOrder.priority === 'CRITICAL' ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-default)'}`,
        borderLeft: `4px solid ${getPriorityColor(workOrder.priority)}`,
        borderRadius: 'var(--radius-md)',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        boxShadow: 'var(--shadow-sm)',
        transition: 'all 0.2s ease',
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '100%',
      }}
    >
      {/* Top Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.75rem', color: 'var(--accent-gold)' }}>
            {workOrder.issue_code}
          </span>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            🏢 {workOrder.property_name || 'Property'} •{' '}
            <strong>{workOrder.unit_number ? `Unit ${workOrder.unit_number}` : 'Common Area'}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
          {getStatusBadge(workOrder.status)}
          {workOrder.blocking_unit === 1 && (
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#ef4444' }}>
              🔒 BLOCKS UNIT
            </span>
          )}
        </div>
      </div>

      {/* Title & Description */}
      <div>
        <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {workOrder.issue_title}
        </h4>
        {workOrder.description && (
          <p
            style={{
              margin: '0.35rem 0 0 0',
              fontSize: '0.82rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {workOrder.description}
          </p>
        )}
      </div>

      {/* Meta Row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          paddingTop: '0.35rem',
          borderTop: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div>
          <span>Category: </span>
          <strong style={{ color: 'var(--text-secondary)' }}>{workOrder.category}</strong>
        </div>

        <div>
          <span>Cost: </span>
          <strong style={{ color: 'var(--text-primary)' }}>
            {formatNaira(workOrder.actual_cost || workOrder.cost || workOrder.estimated_cost || 0)}
          </strong>
        </div>

        <div>
          <span>Assignee: </span>
          <strong style={{ color: isAssignedToCurrentUser ? 'var(--brand-accent)' : 'var(--text-secondary)' }}>
            {workOrder.assigned_to || workOrder.assigned_to_name || 'Unassigned'}
          </strong>
        </div>
      </div>

      {/* Execution Actions Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '0.5rem',
          paddingTop: '0.5rem',
          borderTop: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
        }}
      >
        <Button variant="outline" size="small" onClick={() => onOpenDetail(workOrder)}>
          Details
        </Button>

        <Button
          variant="outline"
          size="small"
          onClick={handleEvidenceClick}
          title="View and attach repair evidence photos"
        >
          📷 Evidence
        </Button>

        {workOrder.status === 'OPEN' && (
          <Button
            variant="primary"
            size="small"
            onClick={() => onStartWork(workOrder.id)}
            disabled={actionLoading}
          >
            ▶ Start Work
          </Button>
        )}

        {(workOrder.status === 'IN_PROGRESS' || workOrder.status === 'OPEN') && (
          <Button
            variant="primary"
            size="small"
            onClick={() => onOpenResolve(workOrder)}
            disabled={actionLoading}
          >
            ✓ Resolve Order
          </Button>
        )}
      </div>
    </div>
  );
}
