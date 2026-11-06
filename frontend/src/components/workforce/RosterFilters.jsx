import React from 'react';
import { Search, Filter, RefreshCw } from '../ui/Icons';
import Button from '../ui/Button';

export default function RosterFilters({
  properties = [],
  activePropertyId,
  onPropertyChange,
  department,
  onDepartmentChange,
  employeeSearch,
  onEmployeeSearchChange,
  shiftStatus,
  onShiftStatusChange,
  coverageFilter,
  onCoverageFilterChange,
  onResetFilters,
  canSwitchProperty = true,
}) {
  const DEPARTMENTS = [
    { value: 'ALL', label: 'All Departments' },
    { value: 'FRONT_DESK', label: 'Front Desk' },
    { value: 'HOUSEKEEPING', label: 'Housekeeping' },
    { value: 'MAINTENANCE', label: 'Maintenance' },
    { value: 'SECURITY', label: 'Security' },
    { value: 'OPERATIONS', label: 'Operations' },
    { value: 'MANAGEMENT', label: 'Management' },
    { value: 'OTHER', label: 'Other' },
  ];

  const STATUSES = [
    { value: 'ALL', label: 'All Statuses' },
    { value: 'SCHEDULED', label: 'Scheduled' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ];

  const COVERAGE_OPTIONS = [
    { value: 'ALL', label: 'All Shifts' },
    { value: 'UNASSIGNED', label: '⚠️ Unassigned Only' },
    { value: 'ASSIGNED', label: '✓ Assigned Only' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.65rem',
        padding: '0.85rem 1rem',
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
      }}
      className="roster-filters-bar"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
        <Filter size={15} />
        <span>Filters:</span>
      </div>

      {/* Property Filter */}
      {canSwitchProperty && properties.length > 0 && (
        <select
          value={activePropertyId || 'all'}
          onChange={(e) => onPropertyChange(e.target.value)}
          className="input-field"
          style={{ width: 'auto', minWidth: '160px', height: '36px', fontSize: '0.82rem' }}
          aria-label="Filter by property"
        >
          <option value="all">🏢 All Properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || `Property #${p.id}`}
            </option>
          ))}
        </select>
      )}

      {/* Department Filter */}
      <select
        value={department}
        onChange={(e) => onDepartmentChange(e.target.value)}
        className="input-field"
        style={{ width: 'auto', minWidth: '145px', height: '36px', fontSize: '0.82rem' }}
        aria-label="Filter by department"
      >
        {DEPARTMENTS.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>

      {/* Coverage Status Filter */}
      <select
        value={coverageFilter}
        onChange={(e) => onCoverageFilterChange(e.target.value)}
        className="input-field"
        style={{ width: 'auto', minWidth: '135px', height: '36px', fontSize: '0.82rem' }}
        aria-label="Filter by coverage"
      >
        {COVERAGE_OPTIONS.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>

      {/* Shift Status Filter */}
      <select
        value={shiftStatus}
        onChange={(e) => onShiftStatusChange(e.target.value)}
        className="input-field"
        style={{ width: 'auto', minWidth: '125px', height: '36px', fontSize: '0.82rem' }}
        aria-label="Filter by shift status"
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      {/* Employee Search Box */}
      <div style={{ position: 'relative', flex: '1 1 180px', minWidth: '160px' }}>
        <input
          type="text"
          placeholder="Search staff name or code..."
          value={employeeSearch}
          onChange={(e) => onEmployeeSearchChange(e.target.value)}
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

      {/* Reset Action */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onResetFilters}
        style={{ height: '36px', fontSize: '0.8rem', color: 'var(--text-muted)' }}
        title="Reset all filters"
      >
        <RefreshCw size={12} style={{ marginRight: '0.25rem' }} />
        Reset
      </Button>
    </div>
  );
}

