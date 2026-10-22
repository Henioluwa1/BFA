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
  messageId,
  isExecuting,
}) {
  if (!component || !component.type) return null;

  switch (component.type) {
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
