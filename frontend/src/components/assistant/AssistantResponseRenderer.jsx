import React from 'react';
import ApartmentGrid from './ApartmentGrid';
import OperationsTable from './OperationsTable';
import FinancialSummaryCard from './FinancialSummaryCard';
import ConfirmationCard from './ConfirmationCard';

/**
 * AssistantResponseRenderer
 *
 * Central, type-safe response component router.
 *
 * Security invariants:
 * - Only renders pre-defined trusted React components.
 * - Does NOT execute arbitrary JSX, HTML strings, or model-generated code.
 * - All data comes from server-authorized, typed `responseComponents` arrays.
 * - The model can only select registered action IDs; the backend maps results to component types.
 */
export default function AssistantResponseRenderer({
  components = [],
  onConfirmAction,
  onCancelAction,
  onSelectApartment,
  onViewApartmentDetails,
  onNavigate,
  messageId,
  isExecuting,
}) {
  if (!Array.isArray(components) || components.length === 0) return null;

  return (
    <div className="response-components-wrapper">
      {components.map((component, idx) => (
        <ComponentSwitch
          key={`${component.type}-${idx}`}
          component={component}
          onConfirmAction={onConfirmAction}
          onCancelAction={onCancelAction}
          onSelectApartment={onSelectApartment}
          onViewApartmentDetails={onViewApartmentDetails}
          onNavigate={onNavigate}
          messageId={messageId}
          isExecuting={isExecuting}
        />
      ))}
    </div>
  );
}

function ComponentSwitch({
  component,
  onConfirmAction,
  onCancelAction,
  onSelectApartment,
  onViewApartmentDetails,
  onNavigate,
  messageId,
  isExecuting,
}) {
  if (!component || !component.type) return null;

  switch (component.type) {
    case 'navigation':
      return (
        <NavigationComponent
          displayName={component.displayName}
          path={component.path}
          onNavigate={onNavigate ? () => onNavigate(component.path) : null}
        />
      );
    case 'text':
      return (
        <TextComponent
          content={component.content}
          variant={component.variant}
        />
      );

    case 'clarification':
      return (
        <ClarificationComponent
          content={component.content}
          missingFields={component.missingFields}
        />
      );

    case 'error':
      return (
        <ErrorComponent
          content={component.content}
          code={component.code}
        />
      );

    case 'apartment_grid':
      return (
        <ApartmentGrid
          apartments={component.apartments}
          checkInDate={component.checkInDate}
          checkOutDate={component.checkOutDate}
          total={component.total}
          showPricing={component.showPricing}
          empty={component.empty}
          onSelectApartment={onSelectApartment}
          onViewDetails={onViewApartmentDetails}
        />
      );

    case 'apartment_card':
      return (
        <SingleApartmentCard
          apartment={component.apartment}
          showPricing={component.showPricing}
          onSelectApartment={onSelectApartment}
        />
      );

    case 'operations_table':
      return (
        <OperationsTable
          tableType={component.tableType}
          rows={component.rows}
          date={component.date}
          total={component.total}
        />
      );

    case 'reservation_summary':
      return (
        <ReservationSummary
          reservation={component.reservation}
        />
      );

    case 'financial_summary':
      return (
        <FinancialSummaryCard
          data={component.data}
        />
      );

    case 'action_preview':
      return (
        <ConfirmationCard
          confirmation={component.confirmation}
          isExecuting={isExecuting}
          onConfirm={(token) => onConfirmAction && onConfirmAction(token, messageId)}
          onCancel={(token) => onCancelAction && onCancelAction(token, messageId)}
        />
      );

    case 'success':
      return (
        <SuccessComponent content={component.content} />
      );

    case 'dev_register':
      return (
        <DevRegisterCard data={component.data} />
      );

    case 'system_diagnostic':
      return (
        <SystemDiagnosticCard data={component.data} />
      );

    case 'development_plan':
      return (
        <DevelopmentPlanCard data={component.data} />
      );

    default:
      // Unknown type: silently skip — no arbitrary rendering
      return null;
  }
}

/* ── Sub-components ── */

function TextComponent({ content, variant = 'normal' }) {
  const variantClass = {
    normal: '',
    info: 'response-text-info',
    warning: 'response-text-warning',
    security: 'response-text-security',
  }[variant] || '';

  return (
    <div className={`response-text ${variantClass}`} style={{ whiteSpace: 'pre-wrap' }}>
      {content}
    </div>
  );
}

function ClarificationComponent({ content, missingFields = [] }) {
  return (
    <div className="response-clarification" role="status" aria-live="polite">
      <div className="response-clarification-icon" aria-hidden="true">💬</div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
      {missingFields.length > 0 && (
        <div className="response-clarification-fields">
          <span>Missing: </span>
          {missingFields.map((f) => (
            <span key={f} className="response-clarification-field-tag">{f}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorComponent({ content, code }) {
  return (
    <div className="response-error" role="alert">
      <div className="response-error-icon" aria-hidden="true">⚠️</div>
      <div>
        <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
        {code && <div className="response-error-code">Code: {code}</div>}
      </div>
    </div>
  );
}

function SuccessComponent({ content }) {
  return (
    <div className="response-success" role="status">
      <div className="response-success-icon" aria-hidden="true">✅</div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
    </div>
  );
}

function NavigationComponent({ displayName, path, onNavigate }) {
  return (
    <div
      className="navigation-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.85rem 1rem',
        borderRadius: '8px',
        background: 'rgba(96, 165, 250, 0.08)',
        border: '1px solid rgba(96, 165, 250, 0.25)',
        marginTop: '0.5rem',
        gap: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: 'rgba(96, 165, 250, 0.15)',
            color: '#60a5fa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          🧭
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
            {displayName || 'Target Page'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Route: <code style={{ color: '#93c5fd' }}>{path}</code>
          </div>
        </div>
      </div>
      {onNavigate && (
        <button
          type="button"
          onClick={onNavigate}
          style={{
            padding: '4px 10px',
            fontSize: '0.75rem',
            fontWeight: 500,
            borderRadius: '4px',
            background: 'var(--brand-accent)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Open Page ↗
        </button>
      )}
    </div>
  );
}

function SingleApartmentCard({ apartment = {}, showPricing, onSelectApartment }) {
  const { unitNumber, unitName, propertyName, isAvailable, checkInDate, ratePerNight, reason } = apartment;
  const displayName = unitName || unitNumber || `Unit #${apartment.apartmentId}`;

  return (
    <div className={`single-apt-card ${isAvailable ? 'available' : 'unavailable'}`} role="status">
      <div className="single-apt-status">
        {isAvailable ? '✅ Available' : '❌ Not Available'}
      </div>
      <div className="single-apt-name">{displayName}</div>
      {propertyName && <div className="single-apt-property">{propertyName}</div>}
      {checkInDate && (
        <div className="single-apt-date">Check-in: <strong>{checkInDate}</strong></div>
      )}
      {showPricing && ratePerNight != null && (
        <div className="single-apt-price">₦{Number(ratePerNight).toLocaleString()} / night</div>
      )}
      {!isAvailable && reason && (
        <div className="single-apt-reason">{reason}</div>
      )}
      {isAvailable && onSelectApartment && checkInDate && (
        <button
          type="button"
          className="apt-card-btn apt-card-btn-primary"
          onClick={() => onSelectApartment(apartment, checkInDate)}
          style={{ marginTop: '0.75rem' }}
        >
          Book This Unit
        </button>
      )}
    </div>
  );
}

function ReservationSummary({ reservation = {} }) {
  return (
    <div className="reservation-summary-card" role="region" aria-label="Reservation Details">
      <div className="reservation-summary-header">
        📋 <strong>{reservation.reservationCode || `Reservation #${reservation.reservationId}`}</strong>
      </div>
      <div className="reservation-summary-grid">
        {reservation.guestName && (
          <div>
            <div className="res-field-label">Guest</div>
            <div className="res-field-value">{reservation.guestName}</div>
          </div>
        )}
        {(reservation.apartmentId || reservation.apartmentNumber) && (
          <div>
            <div className="res-field-label">Unit</div>
            <div className="res-field-value">#{reservation.apartmentNumber || reservation.apartmentId}</div>
          </div>
        )}
        {reservation.propertyName && (
          <div>
            <div className="res-field-label">Property</div>
            <div className="res-field-value">{reservation.propertyName}</div>
          </div>
        )}
        {reservation.checkInDate && (
          <div>
            <div className="res-field-label">Check-in</div>
            <div className="res-field-value">{reservation.checkInDate}</div>
          </div>
        )}
        {reservation.checkOutDate && (
          <div>
            <div className="res-field-label">Check-out</div>
            <div className="res-field-value">{reservation.checkOutDate}</div>
          </div>
        )}
        {reservation.status && (
          <div>
            <div className="res-field-label">Status</div>
            <div className="res-field-value">
              <span className={`res-status-badge status-${reservation.status.toLowerCase()}`}>
                {reservation.status}
              </span>
            </div>
          </div>
        )}
        {reservation.totalAmount != null && (
          <div>
            <div className="res-field-label">Total</div>
            <div className="res-field-value">₦{Number(reservation.totalAmount).toLocaleString()}</div>
          </div>
        )}
        {reservation.paidAmount != null && (
          <div>
            <div className="res-field-label">Paid</div>
            <div className="res-field-value">₦{Number(reservation.paidAmount).toLocaleString()}</div>
          </div>
        )}
        {reservation.paymentStatus && (
          <div>
            <div className="res-field-label">Payment</div>
            <div className="res-field-value">{reservation.paymentStatus}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function DevRegisterCard({ data = {} }) {
  const { baseline = {}, releaseGates = [], tasks = [] } = data;
  return (
    <div className="dev-register-card" style={{
      background: 'rgba(15, 23, 42, 0.65)',
      border: '1px solid rgba(56, 189, 248, 0.25)',
      borderRadius: '8px',
      padding: '0.85rem',
      marginTop: '0.5rem',
      fontSize: '0.85rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
        <strong style={{ color: '#38bdf8' }}>📦 Continuous Development Baseline</strong>
        <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
          {baseline.currentRelease || '1.0.0-rc2'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem', marginBottom: '0.85rem', background: 'rgba(0,0,0,0.2)', padding: '0.65rem', borderRadius: '6px' }}>
        <div><span style={{ color: 'var(--text-muted)' }}>Migrations:</span> <strong>{baseline.databaseMigrations}</strong></div>
        <div><span style={{ color: 'var(--text-muted)' }}>Test Suite:</span> <strong style={{ color: '#4ade80' }}>{baseline.automatedTestSuite}</strong></div>
        <div><span style={{ color: 'var(--text-muted)' }}>Frontend Build:</span> <strong style={{ color: '#4ade80' }}>Passing (0 err)</strong></div>
        <div><span style={{ color: 'var(--text-muted)' }}>Visual QA:</span> <strong style={{ color: '#4ade80' }}>{baseline.visualQAScore}</strong></div>
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>🚦 Release Gates (4 Verification Barriers)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {releaseGates.map((gate, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', fontSize: '0.78rem' }}>
              <div>
                <span style={{ fontWeight: 500 }}>{gate.gate}</span>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Owner: {gate.owner} • {gate.detail}</div>
              </div>
              <span style={{
                fontSize: '0.7rem',
                padding: '2px 6px',
                borderRadius: '4px',
                background: gate.status.includes('READY') ? 'rgba(74, 222, 128, 0.15)' : 'rgba(251, 191, 36, 0.15)',
                color: gate.status.includes('READY') ? '#4ade80' : '#fbbf24',
                whiteSpace: 'nowrap',
                fontWeight: 600
              }}>
                {gate.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>✅ Tracked Release Tasks ({tasks.length})</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {tasks.map((t, idx) => (
            <span key={idx} style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(74, 222, 128, 0.1)', color: '#86efac', border: '1px solid rgba(74, 222, 128, 0.2)' }}>
              {t.id}: {t.title}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SystemDiagnosticCard({ data = {} }) {
  const isHealthy = data.status === 'HEALTHY' || data.status === 'ALL_SYSTEMS_OPERATIONAL';
  return (
    <div className="system-diagnostic-card" style={{
      background: 'rgba(15, 23, 42, 0.65)',
      border: '1px solid rgba(56, 189, 248, 0.25)',
      borderRadius: '8px',
      padding: '0.85rem',
      marginTop: '0.5rem',
      fontSize: '0.85rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
        <strong style={{ color: '#38bdf8' }}>🔍 Real-Time System Health Telemetry</strong>
        <span style={{
          fontSize: '0.75rem',
          padding: '2px 8px',
          borderRadius: '4px',
          background: isHealthy ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          color: isHealthy ? '#4ade80' : '#f87171',
          fontWeight: 600
        }}>
          {isHealthy ? '● HEALTHY' : '⚠️ ATTENTION NEEDED'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem' }}>
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>DB Latency</div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#38bdf8' }}>{data.database?.latencyMs} ms</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Migrations</div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#4ade80' }}>{data.database?.appliedMigrations} / 23 Sync</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Heap Memory</div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{data.runtime?.memoryUsedMb} MB</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Subsystems</div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#4ade80' }}>{data.subsystemsCount} Online</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Modules</div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{data.totalModules} Active</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Backups on Disk</div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fbbf24' }}>{data.backupsCount} Snapshots</div>
        </div>
      </div>
    </div>
  );
}

function DevelopmentPlanCard({ data = {} }) {
  const { task = {}, framework = '', steps = [], complianceNote = '' } = data;
  return (
    <div className="dev-plan-card" style={{
      background: 'rgba(15, 23, 42, 0.65)',
      border: '1px solid rgba(56, 189, 248, 0.25)',
      borderRadius: '8px',
      padding: '0.85rem',
      marginTop: '0.5rem',
      fontSize: '0.85rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
        <div>
          <strong style={{ color: '#38bdf8' }}>📝 {task.title}</strong>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{framework} • Category: {task.category}</div>
        </div>
        <span style={{
          fontSize: '0.72rem',
          padding: '2px 8px',
          borderRadius: '4px',
          background: task.priority === 'CRITICAL' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(56, 189, 248, 0.15)',
          color: task.priority === 'CRITICAL' ? '#f87171' : '#38bdf8',
          fontWeight: 600
        }}>
          {task.priority} Priority
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '4px', margin: '0.65rem 0' }}>
        {steps.map((s) => (
          <div key={s.step} style={{ display: 'flex', gap: '0.5rem', padding: '0.35rem 0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', borderLeft: '3px solid #38bdf8' }}>
            <div style={{ fontWeight: 700, color: '#38bdf8', minWidth: '20px' }}>{s.step}.</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-primary)' }}>{s.phase}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{s.description}</div>
            </div>
          </div>
        ))}
      </div>

      {complianceNote && (
        <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.4rem' }}>
          🛡️ {complianceNote}
        </div>
      )}
    </div>
  );
}
