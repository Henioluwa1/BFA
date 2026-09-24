import React from 'react';

export default function Table({ columns = [], data = [], keyField = 'id', emptyMessage = 'No records found', children, className = '', loading, ...props }) {
  if (children) {
    return (
      <div className="table-container">
        <table className={`table ${className}`.trim()} {...props}>
          {children}
        </table>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className={`table ${className}`.trim()} {...props}>
        <thead>
          <tr>
            {columns.map((col, idx) => (
              <th key={col.key || idx} style={col.width ? { width: col.width } : {}}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length || 1} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIdx) => (
              <tr key={row[keyField] || rowIdx}>
                {columns.map((col, colIdx) => (
                  <td key={col.key || colIdx}>
                    {col.render ? col.render(row[col.key], row, rowIdx) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
