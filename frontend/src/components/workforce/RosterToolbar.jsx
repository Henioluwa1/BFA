import React from 'react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { Calendar, Clock, AlertTriangle, CheckCircle } from '../ui/Icons';

export default function RosterToolbar({
  viewMode = 'weekly',
  onViewModeChange,
  dateLabel = '',
  anchorDate,
  onPrevDate,
  onNextDate,
  onToday,
  onDateSelect,
  canManage = false,
  onOpenCreateShift,
  onOpenCreateRoster,
  onPublishRoster,
  activeRoster = null,
  shiftStats = { total: 0, assigned: 0, unassigned: 0, coveragePct: 100 },
}) {
  const isDraft = activeRoster?.status === 'DRAFT';
  const isPublished = activeRoster?.status === 'PUBLISHED';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        background: 'var(--bg-card)',
        padding: '1rem',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
      className="roster-toolbar"
    >
      {/* Upper Row: Navigation and View Toggles */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        {/* Date Navigation Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={onPrevDate}
              title={`Previous ${viewMode === 'weekly' ? 'Week' : 'Day'}`}
              style={{ width: '32px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ‹
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onToday}
              style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
            >
              {viewMode === 'weekly' ? 'This Week' : 'Today'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onNextDate}
              title={`Next ${viewMode === 'weekly' ? 'Week' : 'Day'}`}
              style={{ width: '32px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ›
            </Button>
          </div>

          {/* Date Picker */}
          <input
            type="date"
            value={anchorDate ? anchorDate.toISOString().split('T')[0] : ''}
            onChange={(e) => onDateSelect(new Date(e.target.value))}
            className="input-field"
            style={{ width: 'auto', height: '32px', fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
          />

          {/* Formatted Date Range Label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: '0.25rem' }}>
            <Calendar size={16} style={{ color: 'var(--primary-color, #10b981)' }} />
            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {dateLabel}
            </span>
          </div>
        </div>

        {/* View Switcher & Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* View Mode Toggle */}
          <div
            style={{
              display: 'flex',
              background: 'var(--bg-surface)',
              padding: '2px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
            }}
          >
            <button
              onClick={() => onViewModeChange('weekly')}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: viewMode === 'weekly' ? 700 : 500,
                background: viewMode === 'weekly' ? 'var(--bg-card)' : 'transparent',
                color: viewMode === 'weekly' ? 'var(--text-primary)' : 'var(--text-muted)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                boxShadow: viewMode === 'weekly' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Weekly Grid
            </button>
            <button
              onClick={() => onViewModeChange('daily')}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: viewMode === 'daily' ? 700 : 500,
                background: viewMode === 'daily' ? 'var(--bg-card)' : 'transparent',
                color: viewMode === 'daily' ? 'var(--text-primary)' : 'var(--text-muted)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                boxShadow: viewMode === 'daily' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Daily Schedule
            </button>
          </div>

          {/* Management Actions */}
          {canManage && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenCreateRoster}
                style={{ fontSize: '0.78rem' }}
              >
                + New Roster
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={onOpenCreateShift}
                style={{ fontSize: '0.78rem', fontWeight: 600 }}
              >
                + Add Shift
              </Button>

              {activeRoster && isDraft && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPublishRoster(activeRoster.id)}
                  style={{
                    fontSize: '0.78rem',
                    borderColor: '#10b981',
                    color: '#10b981',
                    fontWeight: 600,
                  }}
                  title="Publish official shift roster to assigned employees"
                >
                  ✓ Publish Roster
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Lower Row: Summary Metrics & Roster Status */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
          borderTop: '1px solid var(--border-color)',
          paddingTop: '0.5rem',
          fontSize: '0.78rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {activeRoster ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Roster:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {activeRoster.title || activeRoster.roster_code}
              </span>
              <Badge status={isPublished ? 'success' : isDraft ? 'warning' : 'neutral'}>
                {activeRoster.status}
              </Badge>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No active roster container for this date range. Click "+ New Roster" or add a shift to auto-initialize.
            </div>
          )}
        </div>

        {/* Coverage Counters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            Total Shifts: <strong>{shiftStats.total}</strong>
          </span>
          <span style={{ color: '#10b981' }}>
            Assigned: <strong>{shiftStats.assigned}</strong>
          </span>
          {shiftStats.unassigned > 0 ? (
            <span style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: '0.2rem', fontWeight: 600 }}>
              <AlertTriangle size={13} />
              Unassigned: {shiftStats.unassigned}
            </span>
          ) : (
            <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <CheckCircle size={13} />
              100% Staffed
            </span>
          )}
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '0.72rem',
              background: shiftStats.coveragePct === 100 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: shiftStats.coveragePct === 100 ? '#10b981' : '#d97706',
            }}
          >
            {shiftStats.coveragePct}% Covered
          </span>
        </div>
      </div>
    </div>
  );
}

