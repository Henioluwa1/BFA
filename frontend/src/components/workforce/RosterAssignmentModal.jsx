import React, { useState, useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { User, Search, Clock, AlertTriangle, AlertCircle, CheckCircle } from '../ui/Icons';

export default function RosterAssignmentModal({
  isOpen,
  onClose,
  shift,
  employees = [],
  onConfirmAssignment,
  loading = false,
  error = null,
}) {
  const [search, setSearch] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState(shift?.employee_id || null);
  const [departmentFilter, setDepartmentFilter] = useState('ALL');

  if (!shift) return null;

  const startTime = shift.start_time?.slice(0, 5) || '00:00';
  const endTime = shift.end_time?.slice(0, 5) || '00:00';
  const isReassign = Boolean(shift.employee_id);

  // Filter employees
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // Department filter
      if (departmentFilter !== 'ALL' && emp.department && emp.department !== departmentFilter) {
        return false;
      }
      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = emp.full_name?.toLowerCase().includes(q);
        const matchesCode = emp.employee_code?.toLowerCase().includes(q);
        const matchesTitle = emp.job_title?.toLowerCase().includes(q);
        return matchesName || matchesCode || matchesTitle;
      }
      return true;
    });
  }, [employees, departmentFilter, search]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirmAssignment(shift, selectedEmpId);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isReassign ? 'Reassign Shift Staff' : 'Assign Employee to Shift'}
      subtitle={`${shift.shift_date} • ${startTime} - ${endTime} (${shift.department || 'OPERATIONS'})`}
      size="md"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Backend Error Alert if conflict occurred */}
        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ef4444',
              color: '#ef4444',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 700 }}>Scheduling Conflict / Validation Error</div>
              <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>{error}</div>
            </div>
          </div>
        )}

        {/* Current Assignment Card */}
        <div
          style={{
            padding: '0.75rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Current Assignment
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
              {shift.employee_name ? (
                <span>{shift.employee_name} ({shift.employee_code})</span>
              ) : (
                <span style={{ color: '#d97706', fontStyle: 'italic' }}>Unassigned Slot</span>
              )}
            </div>
            {shift.job_title && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{shift.job_title}</div>
            )}
          </div>

          {shift.employee_id && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedEmpId(null)}
              style={{
                fontSize: '0.72rem',
                borderColor: selectedEmpId === null ? '#ef4444' : undefined,
                color: selectedEmpId === null ? '#ef4444' : undefined,
              }}
            >
              {selectedEmpId === null ? '✓ Will Unassign' : 'Set as Unassigned'}
            </Button>
          )}
        </div>

        {/* Search and Department Filter Toolbar */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
            <input
              type="text"
              placeholder="Search staff by name, code or title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field"
              style={{ width: '100%', paddingLeft: '2rem', height: '36px', fontSize: '0.82rem' }}
            />
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '0.65rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
          </div>

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="input-field"
            style={{ width: 'auto', minWidth: '130px', height: '36px', fontSize: '0.82rem' }}
          >
            <option value="ALL">All Roles</option>
            <option value="FRONT_DESK">Front Desk</option>
            <option value="HOUSEKEEPING">Housekeeping</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="SECURITY">Security</option>
            <option value="OPERATIONS">Operations</option>
          </select>
        </div>

        {/* Employee Selection List */}
        <div
          style={{
            maxHeight: '260px',
            overflowY: 'auto',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {filteredEmployees.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No eligible staff members found matching the criteria.
            </div>
          ) : (
            filteredEmployees.map((emp) => {
              const isSelected = selectedEmpId === emp.id;
              const isCurrent = shift.employee_id === emp.id;
              const deptMatch = emp.department === shift.department;

              return (
                <div
                  key={emp.id}
                  onClick={() => setSelectedEmpId(emp.id)}
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderBottom: '1px solid var(--border-color)',
                    background: isSelected ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                    borderLeft: isSelected ? '4px solid #10b981' : '4px solid transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                    <input
                      type="radio"
                      checked={isSelected}
                      onChange={() => setSelectedEmpId(emp.id)}
                      style={{ cursor: 'pointer' }}
                    />
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: '#3b82f6',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {emp.full_name?.charAt(0).toUpperCase() || 'E'}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {emp.full_name || 'Staff Member'}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          ({emp.employee_code || `EMP-${emp.id}`})
                        </span>
                        {isCurrent && (
                          <Badge status="neutral" className="badge-sm">Current</Badge>
                        )}
                      </div>

                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {emp.job_title || 'Employee'}
                        {emp.department && ` • ${emp.department}`}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                    {deptMatch && (
                      <span style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 600 }}>
                        ✓ Dept Match
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={selectedEmpId === shift.employee_id}
          >
            {selectedEmpId === null
              ? 'Confirm Unassign'
              : isReassign
              ? 'Confirm Reassignment'
              : 'Assign to Shift'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

