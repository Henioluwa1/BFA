import React from 'react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { User, Clock, AlertTriangle, AlertCircle } from '../ui/Icons';

const DEPARTMENT_COLORS = {
  FRONT_DESK: { bg: 'rgba(37, 99, 235, 0.1)', border: '#2563eb', text: '#2563eb', label: 'Front Desk' },
  HOUSEKEEPING: { bg: 'rgba(16, 185, 129, 0.1)', border: '#10b981', text: '#10b981', label: 'Housekeeping' },
  MAINTENANCE: { bg: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b', text: '#f59e0b', label: 'Maintenance' },
  SECURITY: { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444', text: '#ef4444', label: 'Security' },
  OPERATIONS: { bg: 'rgba(139, 92, 246, 0.1)', border: '#8b5cf6', text: '#8b5cf6', label: 'Operations' },
  MANAGEMENT: { bg: 'rgba(79, 70, 229, 0.1)', border: '#4f46e5', text: '#4f46e5', label: 'Management' },
  OTHER: { bg: 'rgba(107, 114, 128, 0.1)', border: '#6b7280', text: '#6b7280', label: 'General' },
};

export default function RosterShiftCard({
  shift,
  canManage = false,
  onAssign,
  onUnassign,
  onDelete,
  onViewDetails,
}) {
  const deptStyle = DEPARTMENT_COLORS[shift.department] || DEPARTMENT_COLORS.OTHER;
  const isAssigned = Boolean(shift.employee_id);
  const startTime = shift.start_time?.slice(0, 5) || '00:00';
  const endTime = shift.end_time?.slice(0, 5) || '00:00';

  // Compute duration in hours
  const calculateDuration = () => {
    try {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      let diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff < 0) diff += 24 * 60; // Overnight shift
      return (diff / 60).toFixed(1);
    } catch {
      return null;
    }
  };
  const duration = calculateDuration();

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: isAssigned ? `1px solid var(--border-color)` : `1px dashed #f59e0b`,
        borderLeft: `4px solid ${shift.color_code || deptStyle.border}`,
        padding: '0.65rem 0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        position: 'relative',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      className="roster-shift-card"
    >
      {/* Top Header: Time and Department */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.35rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          <Clock size={13} style={{ color: deptStyle.border }} />
          <span>{startTime} - {endTime}</span>
          {duration && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>({duration}h)</span>}
        </div>

        <span
          style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: '4px',
            background: deptStyle.bg,
            color: deptStyle.text,
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
          }}
        >
          {deptStyle.label}
        </span>
      </div>

      {/* Shift Template / Title if present */}
      {shift.template_name && (
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          {shift.template_name}
        </div>
      )}

      {/* Assignment Section */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.4rem 0.5rem',
          borderRadius: 'var(--radius-sm)',
          background: isAssigned ? 'var(--bg-surface)' : 'rgba(245, 158, 11, 0.08)',
          border: isAssigned ? '1px solid var(--border-color)' : '1px dashed rgba(245, 158, 11, 0.3)',
        }}
      >
        {isAssigned ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: deptStyle.border,
                color: '#fff',
                fontSize: '0.7rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {shift.employee_name?.charAt(0).toUpperCase() || 'E'}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={shift.employee_name}
              >
                {shift.employee_name}
              </div>
              <div
                style={{
                  fontSize: '0.68rem',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {shift.job_title || shift.employee_code || 'Staff Member'}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#d97706', fontSize: '0.75rem', fontWeight: 600 }}>
            <AlertTriangle size={14} />
            <span>Unassigned Slot</span>
          </div>
        )}

        {/* Quick Assign / Reassign Button */}
        {canManage && (
          <Button
            size="sm"
            variant={isAssigned ? 'ghost' : 'outline'}
            style={{
              fontSize: '0.7rem',
              padding: '0.15rem 0.45rem',
              height: 'auto',
              flexShrink: 0,
              borderColor: !isAssigned ? '#f59e0b' : undefined,
              color: !isAssigned ? '#d97706' : undefined,
            }}
            onClick={() => onAssign(shift)}
            title={isAssigned ? 'Reassign Employee' : 'Assign Employee'}
          >
            {isAssigned ? 'Reassign' : '+ Assign'}
          </Button>
        )}
      </div>

      {/* Footer Details & Action Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--border-color)',
          paddingTop: '0.35rem',
          marginTop: '0.1rem',
          fontSize: '0.7rem',
        }}
      >
        <Badge
          status={
            shift.status === 'COMPLETED'
              ? 'success'
              : shift.status === 'IN_PROGRESS'
              ? 'warning'
              : shift.status === 'CANCELLED'
              ? 'error'
              : 'neutral'
          }
        >
          {shift.status || 'SCHEDULED'}
        </Badge>

        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
          {canManage && isAssigned && (
            <button
              onClick={() => onUnassign(shift)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.68rem',
                textDecoration: 'underline',
                padding: '0.1rem 0.2rem',
              }}
              title="Remove employee assignment"
            >
              Unassign
            </button>
          )}

          {canManage && (
            <button
              onClick={() => onDelete(shift)}
              style={{
                background: 'none',
                border: 'none',
                color: '#ef4444',
                cursor: 'pointer',
                fontSize: '0.68rem',
                padding: '0.1rem 0.2rem',
              }}
              title="Delete this shift"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

