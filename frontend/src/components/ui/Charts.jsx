import React, { useState, useId } from 'react';

/**
 * Common color palette harmonized with the BFA design system
 */
export const CHART_COLORS = [
  '#c25e2e', // Terracotta primary brand
  '#10b981', // Emerald green
  '#3b82f6', // Sapphire blue
  '#f59e0b', // Amber / gold
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#64748b', // Slate
  '#e11d48', // Rose red
];

/**
 * Standard Empty State for Charts
 */
export function ChartEmptyState({ title, message = 'No data available for the selected filters.' }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem 1.5rem',
        background: 'var(--bg-secondary, #f8fafc)',
        borderRadius: 'var(--radius-md, 8px)',
        border: '1px dashed var(--border-color, #cbd5e1)',
        minHeight: '200px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.6 }}>📊</div>
      {title && <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', color: 'var(--text-primary, #1e293b)' }}>{title}</h4>}
      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted, #64748b)', maxWidth: '360px' }}>
        {message}
      </p>
    </div>
  );
}

/**
 * Reusable LineChart for time series and progression
 */
export function LineChart({
  data = [],
  xKey = 'period',
  series = [{ key: 'value', label: 'Value', color: '#c25e2e' }],
  title,
  yLabel,
  formatValue = (v) => v,
  height = 240,
  emptyMessage,
}) {
  const chartId = useId();
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [showTable, setShowTable] = useState(false);

  if (!data || data.length === 0) {
    return <ChartEmptyState title={title} message={emptyMessage} />;
  }

  const getVal = (d, key) => {
    if (d[key] !== undefined && d[key] !== null) return parseFloat(d[key]) || 0;
    if (key === 'netRevenue' && d['netCollections'] !== undefined) return parseFloat(d['netCollections']) || 0;
    if (key === 'collections' && d['netCollections'] !== undefined) return parseFloat(d['netCollections']) || 0;
    return 0;
  };

  // Calculate scaling
  const allValues = data.flatMap((d) => series.map((s) => getVal(d, s.key)));
  const maxVal = Math.max(10, ...allValues) * 1.15;
  const minVal = 0;

  const width = 600;
  const padLeft = 65;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 40;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const getX = (idx) => {
    if (data.length <= 1) return padLeft + innerW / 2;
    return padLeft + (idx / (data.length - 1)) * innerW;
  };

  const getY = (val) => {
    const norm = (val - minVal) / (maxVal - minVal);
    return padTop + innerH - norm * innerH;
  };

  // 4 Y-ticks
  const yTicks = [0, maxVal * 0.33, maxVal * 0.66, maxVal];

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Chart Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          {title && <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h4>}
          {yLabel && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{yLabel}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Legend */}
          <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
            {series.map((s) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: s.color }} />
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{s.label}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowTable((prev) => !prev)}
            style={{
              background: 'none',
              border: '1px solid var(--border-color, #cbd5e1)',
              borderRadius: '4px',
              padding: '0.2rem 0.5rem',
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {showTable ? 'Hide Table' : 'Table View'}
          </button>
        </div>
      </div>

      {/* SVG Container */}
      <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
          role="img"
          aria-label={title || 'Line chart'}
        >
          {/* Grid lines */}
          {yTicks.map((t, idx) => {
            const y = getY(t);
            return (
              <g key={idx}>
                <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" strokeWidth="1" />
                <text x={padLeft - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
                  {formatValue(Math.round(t))}
                </text>
              </g>
            );
          })}

          {/* Series Lines & Areas */}
          {series.map((s) => {
            const points = data.map((d, i) => `${getX(i)},${getY(getVal(d, s.key))}`).join(' ');
            return (
              <g key={s.key}>
                <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
                {data.map((d, i) => {
                  const cx = getX(i);
                  const cy = getY(getVal(d, s.key));
                  const isHovered = hoveredIdx === i;
                  return (
                    <circle
                      key={i}
                      cx={cx}
                      cy={cy}
                      r={isHovered ? 6 : 4}
                      fill="#ffffff"
                      stroke={s.color}
                      strokeWidth={isHovered ? 3 : 2}
                      style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                      onMouseEnter={() => setHoveredIdx(i)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* X-axis labels */}
          {data.map((d, i) => {
            const x = getX(i);
            const label = String(d[xKey] || d['period'] || d['month'] || '');
            // Only render every nth label if too crowded
            const step = Math.ceil(data.length / 8);
            if (i % step !== 0 && i !== data.length - 1) return null;
            return (
              <text key={i} x={x} y={height - 12} textAnchor="middle" fontSize="10" fill="#64748b">
                {label}
              </text>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredIdx !== null && data[hoveredIdx] && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: `${(getX(hoveredIdx) / width) * 100}%`,
              transform: 'translateX(-50%)',
              background: 'rgba(15, 23, 42, 0.92)',
              color: '#ffffff',
              padding: '0.45rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              pointerEvents: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              zIndex: 10,
              minWidth: '120px',
            }}
          >
            <div style={{ fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.2rem', marginBottom: '0.25rem' }}>
              {data[hoveredIdx][xKey] || data[hoveredIdx]['period'] || data[hoveredIdx]['month']}
            </div>
            {series.map((s) => (
              <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', margin: '0.15rem 0' }}>
                <span style={{ color: s.color, fontWeight: 600 }}>{s.label}:</span>
                <span style={{ fontWeight: 700 }}>{formatValue(getVal(data[hoveredIdx], s.key))}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Accessible Table View */}
      {showTable && (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '0.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>{(xKey || 'PERIOD').toUpperCase()}</th>
                {series.map((s) => (
                  <th key={s.key} style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.35rem 0.6rem' }}>{row[xKey] || row['period'] || row['month']}</td>
                  {series.map((s) => (
                    <td key={s.key} style={{ padding: '0.35rem 0.6rem', textAlign: 'right', fontWeight: 600 }}>
                      {formatValue(getVal(row, s.key))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Reusable GroupedBarChart for comparative dual-metric series over intervals
 */
export function GroupedBarChart({
  data = [],
  xKey = 'period',
  bars,
  series,
  title,
  yLabel,
  formatValue = (v) => v,
  height = 240,
  emptyMessage,
}) {
  const [hovered, setHovered] = useState(null);

  const activeBars = bars || series || [
    { key: 'bookedRevenue', label: 'Booked Value', color: '#3b82f6' },
    { key: 'netCollections', label: 'Collections', color: '#10b981' },
  ];

  if (!data || data.length === 0) {
    return <ChartEmptyState title={title} message={emptyMessage} />;
  }

  const getGroupVal = (d, key) => {
    if (d[key] !== undefined && d[key] !== null) return parseFloat(d[key]) || 0;
    if (key === 'collections' && d['netCollections'] !== undefined) return parseFloat(d['netCollections']) || 0;
    if (key === 'netCollections' && d['collections'] !== undefined) return parseFloat(d['collections']) || 0;
    return 0;
  };

  const allVals = data.flatMap((d) => activeBars.map((b) => getGroupVal(d, b.key)));
  const maxVal = Math.max(10, ...allVals) * 1.15;

  const width = 600;
  const padLeft = 65;
  const padRight = 20;
  const padTop = 25;
  const padBottom = 40;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const groupWidth = innerW / data.length;
  const barW = Math.max(4, Math.min(24, (groupWidth * 0.75) / activeBars.length));

  const yTicks = [0, maxVal * 0.33, maxVal * 0.66, maxVal];

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          {title && <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h4>}
          {yLabel && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{yLabel}</div>}
        </div>
        <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
          {activeBars.map((b) => (
            <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: b.color }} />
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {/* Y-ticks */}
          {yTicks.map((t, idx) => {
            const y = padTop + innerH - (t / maxVal) * innerH;
            return (
              <g key={idx}>
                <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" strokeWidth="1" />
                <text x={padLeft - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
                  {formatValue(Math.round(t))}
                </text>
              </g>
            );
          })}

          {/* Groups */}
          {data.map((d, gIdx) => {
            const groupX = padLeft + gIdx * groupWidth + (groupWidth - barW * activeBars.length) / 2;
            const periodLabel = String(d[xKey] || d['period'] || d['month'] || d['source'] || '');
            return (
              <g key={gIdx}>
                {activeBars.map((b, bIdx) => {
                  const val = getGroupVal(d, b.key);
                  const h = Math.max(2, (val / maxVal) * innerH);
                  const x = groupX + bIdx * barW;
                  const y = padTop + innerH - h;
                  const isHovered = hovered?.gIdx === gIdx && hovered?.bIdx === bIdx;
                  return (
                    <rect
                      key={b.key}
                      x={x}
                      y={y}
                      width={barW - 2}
                      height={h}
                      fill={b.color}
                      rx="3"
                      opacity={isHovered ? 1 : 0.9}
                      style={{ cursor: 'pointer', transition: 'opacity 0.15s ease' }}
                      onMouseEnter={() => setHovered({ gIdx, bIdx, label: b.label, val, period: periodLabel })}
                      onMouseLeave={() => setHovered(null)}
                    />
                  );
                })}

                {/* X label */}
                <text x={padLeft + gIdx * groupWidth + groupWidth / 2} y={height - 12} textAnchor="middle" fontSize="10" fill="#64748b">
                  {periodLabel}
                </text>
              </g>
            );
          })}
        </svg>

        {hovered && (
          <div
            style={{
              position: 'absolute',
              top: '8px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(15, 23, 42, 0.95)',
              color: '#ffffff',
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              pointerEvents: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              zIndex: 10,
            }}
          >
            <span style={{ fontWeight: 600 }}>{hovered.period}</span> — <span>{hovered.label}:</span>{' '}
            <strong style={{ color: '#38bdf8' }}>{formatValue(hovered.val)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Reusable BarChart for single category/ranking comparison
 */
export function BarChart({
  data = [],
  xKey = 'name',
  yKey = 'value',
  title,
  formatValue = (v) => v,
  color = '#c25e2e',
  benchmark = null,
  benchmarkLabel = 'Standard Target',
  height = 240,
  emptyMessage,
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!data || data.length === 0) {
    return <ChartEmptyState title={title} message={emptyMessage} />;
  }

  const getBarVal = (d) => {
    if (d[yKey] !== undefined && d[yKey] !== null) return parseFloat(d[yKey]) || 0;
    if (yKey === 'outstanding' && d['outstanding_amount'] !== undefined) return parseFloat(d['outstanding_amount']) || 0;
    if (yKey === 'outstanding_amount' && d['outstanding'] !== undefined) return parseFloat(d['outstanding']) || 0;
    if (d['value'] !== undefined) return parseFloat(d['value']) || 0;
    return 0;
  };

  const values = data.map((d) => getBarVal(d));
  const maxVal = Math.max(10, benchmark || 0, ...values) * 1.15;

  const width = 600;
  const padLeft = 65;
  const padRight = 20;
  const padTop = 25;
  const padBottom = 40;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const barW = Math.max(8, Math.min(36, (innerW / data.length) * 0.65));
  const step = innerW / data.length;

  const yTicks = [0, maxVal * 0.33, maxVal * 0.66, maxVal];

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {title && <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h4>}
        {benchmark && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: '#b45309' }}>
            <span style={{ width: '16px', height: '2px', background: '#f59e0b', display: 'inline-block' }} />
            <span>{benchmarkLabel} ({benchmark})</span>
          </div>
        )}
      </div>

      <div style={{ position: 'relative', width: '100%' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {/* Y-ticks */}
          {yTicks.map((t, idx) => {
            const y = padTop + innerH - (t / maxVal) * innerH;
            return (
              <g key={idx}>
                <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" strokeWidth="1" />
                <text x={padLeft - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
                  {formatValue(Math.round(t))}
                </text>
              </g>
            );
          })}

          {/* Benchmark line */}
          {benchmark !== null && (
            <line
              x1={padLeft}
              y1={padTop + innerH - (benchmark / maxVal) * innerH}
              x2={width - padRight}
              y2={padTop + innerH - (benchmark / maxVal) * innerH}
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          )}

          {/* Bars */}
          {data.map((d, i) => {
            const val = getBarVal(d);
            const h = Math.max(2, (val / maxVal) * innerH);
            const x = padLeft + i * step + (step - barW) / 2;
            const y = padTop + innerH - h;
            const isHovered = hoveredIdx === i;
            const barColor = d.color || color;
            const label = String(d[xKey] || d['property_name'] || d['criterion'] || d['metric'] || d['name'] || '');
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  fill={barColor}
                  rx="4"
                  opacity={isHovered ? 1 : 0.88}
                  style={{ cursor: 'pointer', transition: 'opacity 0.15s ease' }}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
                <text
                  x={x + barW / 2}
                  y={height - 14}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="#64748b"
                  style={{ textTransform: 'capitalize' }}
                >
                  {label.slice(0, 10)}
                </text>
              </g>
            );
          })}
        </svg>

        {hoveredIdx !== null && data[hoveredIdx] && (
          <div
            style={{
              position: 'absolute',
              top: '8px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(15, 23, 42, 0.95)',
              color: '#ffffff',
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              pointerEvents: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              zIndex: 10,
            }}
          >
            <span style={{ fontWeight: 600 }}>{data[hoveredIdx][xKey]}:</span>{' '}
            <strong style={{ color: '#38bdf8' }}>{formatValue(data[hoveredIdx][yKey])}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Reusable DoughnutChart for composition and distribution
 */
export function DoughnutChart({
  data = [],
  title,
  formatValue = (v) => v,
  totalLabel = 'Total Value',
  size = 240,
  emptyMessage,
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const total = data.reduce((acc, d) => acc + (parseFloat(d.value) || 0), 0);

  if (!data || data.length === 0 || total === 0) {
    return <ChartEmptyState title={title} message={emptyMessage || 'No breakdown data available.'} />;
  }

  const radius = size * 0.38;
  const strokeWidth = size * 0.15;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {title && <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h4>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
        {/* SVG Donut */}
        <div style={{ position: 'relative', width: `${size}px`, height: `${size}px` }}>
          <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
            {data.map((slice, idx) => {
              const val = parseFloat(slice.value) || 0;
              const percent = val / total;
              const strokeDasharray = `${circumference * percent} ${circumference * (1 - percent)}`;
              const strokeDashoffset = -circumference * accumulatedPercent;
              accumulatedPercent += percent;
              const color = slice.color || CHART_COLORS[idx % CHART_COLORS.length];
              const isHovered = hoveredIdx === idx;

              return (
                <circle
                  key={idx}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="transparent"
                  stroke={color}
                  strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  style={{ cursor: 'pointer', transition: 'stroke-width 0.2s ease, opacity 0.2s ease' }}
                  opacity={hoveredIdx === null || isHovered ? 1 : 0.65}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              );
            })}
          </svg>

          {/* Center Content */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              pointerEvents: 'none',
              width: `${(radius - strokeWidth / 2) * 2}px`,
            }}
          >
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              {hoveredIdx !== null ? data[hoveredIdx].label : totalLabel}
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
              {hoveredIdx !== null ? formatValue(data[hoveredIdx].value) : formatValue(total)}
            </div>
            {hoveredIdx !== null && (
              <div style={{ fontSize: '0.7rem', color: 'var(--brand-accent)', fontWeight: 700 }}>
                {Math.round(((data[hoveredIdx].value || 0) / total) * 100)}%
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '180px', flex: '1 1 200px' }}>
          {data.map((item, idx) => {
            const color = item.color || CHART_COLORS[idx % CHART_COLORS.length];
            const pct = Math.round(((parseFloat(item.value) || 0) / total) * 100);
            const isHovered = hoveredIdx === idx;
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.3rem 0.5rem',
                  borderRadius: '4px',
                  background: isHovered ? 'var(--bg-secondary, #f1f5f9)' : 'transparent',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                }}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
                  <span style={{ fontWeight: isHovered ? 700 : 500, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                    {item.label}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{formatValue(item.value)}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: '32px', textAlign: 'right' }}>
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable RadarChart for multi-criteria assessment (e.g., 9 performance dimensions)
 */
export function RadarChart({
  data = [],
  title,
  color = '#c25e2e',
  benchmark = 80,
  size = 280,
  emptyMessage,
}) {
  if (!data || data.length < 3) {
    return <ChartEmptyState title={title} message={emptyMessage || 'At least 3 evaluation criteria required.'} />;
  }

  const center = size / 2;
  const radius = size * 0.36;
  const totalAxes = data.length;
  const angleSlice = (Math.PI * 2) / totalAxes;

  // Grid levels (20%, 40%, 60%, 80%, 100%)
  const levels = [0.2, 0.4, 0.6, 0.8, 1.0];

  // Helper to get coordinates
  const getCoords = (val, max, idx) => {
    const r = (val / max) * radius;
    const angle = angleSlice * idx - Math.PI / 2;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  // Polygon points
  const points = data
    .map((d, i) => {
      const max = d.max || 100;
      const val = parseFloat(d.score || d.value || 0);
      const coords = getCoords(val, max, i);
      return `${coords.x},${coords.y}`;
    })
    .join(' ');

  // Benchmark points
  const benchmarkPoints = benchmark
    ? data
        .map((d, i) => {
          const max = d.max || 100;
          const coords = getCoords(benchmark, max, i);
          return `${coords.x},${coords.y}`;
        })
        .join(' ')
    : null;

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {title && <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h4>}
        {benchmark && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: '#b45309' }}>
            <span style={{ width: '12px', height: '12px', border: '1.5px dashed #f59e0b', borderRadius: '50%' }} />
            <span>Target Benchmark ({benchmark}/100)</span>
          </div>
        )}
      </div>

      <div style={{ width: `${size}px`, height: `${size}px`, position: 'relative' }}>
        <svg width={size} height={size} style={{ display: 'block', overflow: 'visible' }}>
          {/* Background web levels */}
          {levels.map((lvl, lIdx) => {
            const levelPoints = data
              .map((_, i) => {
                const angle = angleSlice * i - Math.PI / 2;
                const r = radius * lvl;
                return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
              })
              .join(' ');
            return (
              <polygon
                key={lIdx}
                points={levelPoints}
                fill={lvl === 1.0 ? 'var(--bg-secondary, #f8fafc)' : 'none'}
                stroke="#cbd5e1"
                strokeWidth="0.8"
                strokeDasharray={lvl < 1.0 ? '2 2' : undefined}
              />
            );
          })}

          {/* Axis lines and labels */}
          {data.map((d, i) => {
            const angle = angleSlice * i - Math.PI / 2;
            const lineX = center + radius * Math.cos(angle);
            const lineY = center + radius * Math.sin(angle);
            // Label placement slightly beyond perimeter
            const labelR = radius + 22;
            const labelX = center + labelR * Math.cos(angle);
            const labelY = center + labelR * Math.sin(angle);
            const label = d.name || d.label || d.criteria_name || `C${i + 1}`;
            const score = Math.round(parseFloat(d.score || d.value || 0));

            return (
              <g key={i}>
                <line x1={center} y1={center} x2={lineX} y2={lineY} stroke="#e2e8f0" strokeWidth="1" />
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="8.5"
                  fontWeight="600"
                  fill="var(--text-secondary, #475569)"
                >
                  {label} ({score})
                </text>
              </g>
            );
          })}

          {/* Benchmark polygon */}
          {benchmarkPoints && (
            <polygon
              points={benchmarkPoints}
              fill="rgba(245, 158, 11, 0.08)"
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          )}

          {/* Actual score polygon */}
          <polygon
            points={points}
            fill="rgba(194, 94, 46, 0.25)"
            stroke={color}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* Vertex circles */}
          {data.map((d, i) => {
            const max = d.max || 100;
            const val = parseFloat(d.score || d.value || 0);
            const coords = getCoords(val, max, i);
            return (
              <circle
                key={i}
                cx={coords.x}
                cy={coords.y}
                r="4.5"
                fill="#ffffff"
                stroke={color}
                strokeWidth="2.5"
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}

