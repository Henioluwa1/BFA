import React from 'react';

/**
 * OperationsTable — Renders arrivals or departures as a structured table.
 * Used inside the Operations Assistant for today's check-in/check-out data.
 */
export default function OperationsTable({
  tableType = 'arrivals',
  rows = [],
  date,
  total,
}) {
  const isArrivals = tableType === 'arrivals';
  const title = isArrivals ? "Today's Arrivals" : "Today's Departures";
  const icon = isArrivals ? '📅' : '🚪';

  if (rows.length === 0) {
    return (
      <div className="ops-table-empty" role="status">
        <span>{icon}</span>
        <p>No {isArrivals ? 'arrivals' : 'departures'} scheduled{date ? ` for ${date}` : ' today'}.</p>
      </div>
    );
  }

  return (
    <div className="ops-table-wrapper" aria-label={title}>
      <div className="ops-table-header">
        <span className="ops-table-title">{icon} {title}</span>
        <span className="ops-table-count">{total} guest{total !== 1 ? 's' : ''}{date ? ` · ${date}` : ''}</span>
      </div>

      <div className="ops-table-scroll">
        <table className="ops-table" role="table">
          <thead>
            <tr>
              <th scope="col">Guest</th>
              <th scope="col">Unit</th>
              <th scope="col">Property</th>
              <th scope="col">Booking Code</th>
              <th scope="col">Status</th>
              <th scope="col">{isArrivals ? 'Check-in' : 'Check-out'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.reservationId || idx}>
                <td className="ops-table-guest">{row.guestName || '—'}</td>
                <td>{row.unitNumber || row.unitName || '—'}</td>
                <td>{row.propertyName || '—'}</td>
                <td className="ops-table-code">{row.reservationCode || '—'}</td>
                <td>
                  <span className={`ops-table-status-badge status-${(row.status || '').toLowerCase()}`}>
                    {row.status || '—'}
                  </span>
                </td>
                <td>{isArrivals ? row.checkInDate : row.checkOutDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
