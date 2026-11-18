import React from 'react';
import { apiFetch } from '../api';

const RANGES = [
  { key: '1mo', label: '1M' },
  { key: '3mo', label: '3M' },
  { key: '6mo', label: '6M' },
  { key: '1y', label: '1A' },
];

function formatDateBr(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtVol(v) {
  if (!v) return '';
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace('.', ',')}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

function fmtBr(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return Number(v).toFixed(2).replace('.', ',');
}

function PriceChart({ symbol, compact = false, embedded = false, defaultRange = '3mo' }) {
  const [range, setRange] = React.useState(defaultRange);
  const [mode, setMode] = React.useState('area'); // 'area' | 'candles'
  const [showSma, setShowSma] = React.useState(false);
  const [history, setHistory] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [hoverIdx, setHoverIdx] = React.useState(null);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setHoverIdx(null);
    apiFetch(`/api/indicators/${encodeURIComponent(symbol)}/history?range=${range}`, {
      signal: controller.signal,
    })
      .then((data) => {
        setHistory(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setHistory(null);
        setLoading(false);
      });
    return () => controller.abort();
  }, [symbol, range]);

  const points = history?.points || [];
  const hasOhlc = points.some(
    (p) =>
      typeof p.open === 'number' &&
      typeof p.high === 'number' &&
      typeof p.low === 'number' &&
      p.high >= p.low &&
      p.open > 0
  );
  const activeMode = mode === 'candles' && hasOhlc ? 'candles' : 'area';

  const firstPrice = points[0]?.close ?? 0;
  const lastPrice = points[points.length - 1]?.close ?? 0;
  const periodChange = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
  const isUp = periodChange >= 0;
  const strokeColor = isUp ? '#10b981' : '#f43f5e';

  const W = 760;
  const H = compact ? 215 : 275;
  const padL = 58;
  const padR = 14;
  const padT = 18;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Determine vertical domain across high/low when candles are active
  const highs = points.map((p) => (activeMode === 'candles' && typeof p.high === 'number' ? p.high : p.close));
  const lows = points.map((p) => (activeMode === 'candles' && typeof p.low === 'number' ? p.low : p.close));
  const minP = lows.length ? Math.min(...lows) : 0;
  const maxP = highs.length ? Math.max(...highs) : 1;
  const span = maxP - minP || 1;

  const volumes = points.map((p) => p.volume || 0);
  const maxVol = volumes.length ? Math.max(...volumes) : 0;
  const hasVolume = maxVol > 0;
  const volMaxH = compact ? 28 : 38;

  const toY = (val) => padT + plotH - ((val - minP) / span) * plotH;

  // 20-period Simple Moving Average (real math on real closing prices)
  const smaPeriod = Math.min(20, Math.max(5, Math.floor(points.length / 3)));
  const smaValues = points.map((_, i) => {
    if (i < smaPeriod - 1) return null;
    let sum = 0;
    for (let k = i - smaPeriod + 1; k <= i; k++) sum += points[k].close;
    return sum / smaPeriod;
  });

  const coords = points.map((p, i) => {
    const x = padL + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
    const y = toY(p.close);
    const openY = typeof p.open === 'number' ? toY(p.open) : y;
    const highY = typeof p.high === 'number' ? toY(p.high) : y;
    const lowY = typeof p.low === 'number' ? toY(p.low) : y;
    const smaY = smaValues[i] != null ? toY(smaValues[i]) : null;
    const volH = hasVolume ? ((p.volume || 0) / maxVol) * volMaxH : 0;
    return { x, y, openY, highY, lowY, smaY, smaVal: smaValues[i], volH, ...p };
  });

  const baselineY = firstPrice ? toY(firstPrice) : null;

  const linePath = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');
  const areaPath = coords.length
    ? `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)} L${coords[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} Z`
    : '';
  const smaPath = coords
    .filter((c) => c.smaY != null)
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.smaY.toFixed(1)}`)
    .join(' ');

  const activePoint = hoverIdx != null && coords[hoverIdx] ? coords[hoverIdx] : null;
  const activeDelta =
    activePoint && firstPrice > 0 ? ((activePoint.close - firstPrice) / firstPrice) * 100 : null;
  const yTicks = [maxP, minP + span * 0.5, minP];

  const updatePointer = (clientX, target) => {
    if (coords.length < 2) return;
    const rect = target.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * W;
    const ratio = Math.min(1, Math.max(0, (relX - padL) / plotW));
    const idx = Math.round(ratio * (coords.length - 1));
    setHoverIdx(idx);
  };

  // Clamp floating tooltip inside SVG bounds
  const tipW = 154;
  const tipH = activePoint?.volume ? 58 : 44;
  const tipX = activePoint
    ? Math.min(W - padR - tipW, Math.max(padL, activePoint.x - tipW / 2))
    : 0;
  const tipY = activePoint
    ? activePoint.y - tipH - 12 < padT
      ? activePoint.y + 12
      : activePoint.y - tipH - 12
    : 0;

  const candleW = Math.max(2.5, Math.min(9, (plotW / Math.max(coords.length, 1)) * 0.62));
  const gradId = `grad-${symbol}-${compact ? 'c' : 'f'}`;

  return (
    <div
      className={embedded ? undefined : 'card'}
      style={embedded ? undefined : { padding: compact ? '1rem 1.15rem' : '1.25rem 1.35rem' }}
    >
      <div style={styles.header}>
        <div>
          {!embedded && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
              <h3 style={styles.title}>Gráfico de Cotação · {symbol}</h3>
              {history?.source && (
                <span className="pill pill-neutral" style={{ fontSize: '0.67rem' }}>
                  {history.source === 'brapi-live' ? 'Dados reais B3' : 'Cache B3'}
                </span>
              )}
            </div>
          )}
          {points.length > 1 && (
            <div style={{ ...styles.activeReadout, marginTop: embedded ? 0 : '0.4rem' }}>
              <span className={`pill num ${isUp ? 'pill-pos' : 'pill-neg'}`}>
                {isUp ? '▲ +' : '▼ '}
                {periodChange.toFixed(2).replace('.', ',')}% ({RANGES.find((r) => r.key === range)?.label})
              </span>
              {activePoint ? (
                <span className="mono" style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                  {formatDateBr(activePoint.date)}
                  {typeof activePoint.open === 'number' && ` · A: ${fmtBr(activePoint.open)}`}
                  {typeof activePoint.high === 'number' && ` · M: ${fmtBr(activePoint.high)}`}
                  {typeof activePoint.low === 'number' && ` · m: ${fmtBr(activePoint.low)}`}
                  {` · F: ${fmtBr(activePoint.close)}`}
                  {showSma && activePoint.smaVal != null && ` · MM${smaPeriod}: ${fmtBr(activePoint.smaVal)}`}
                </span>
              ) : (
                <span className="num" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Mín: R$ {fmtBr(minP)} · Máx: R$ {fmtBr(maxP)}
                </span>
              )}
            </div>
          )}
        </div>

        <div style={styles.controlsWrap}>
          {hasOhlc && (
            <div className="segmented-tabs" role="group" aria-label="Estilo do gráfico">
              <button
                type="button"
                className={`segmented-tab ${activeMode === 'area' ? 'active' : ''}`}
                onClick={() => setMode('area')}
              >
                Área
              </button>
              <button
                type="button"
                className={`segmented-tab ${activeMode === 'candles' ? 'active' : ''}`}
                onClick={() => setMode('candles')}
              >
                Velas
              </button>
            </div>
          )}

          {points.length >= 10 && (
            <button
              type="button"
              className={`chip-btn mono ${showSma ? 'active' : ''}`}
              style={{ padding: '0.26rem 0.56rem', fontSize: '0.72rem' }}
              onClick={() => setShowSma((v) => !v)}
              title={`Exibir Média Móvel Simples de ${smaPeriod} pregões`}
              aria-pressed={showSma}
            >
              MM{smaPeriod}
            </button>
          )}

          <div style={styles.rangeGroup}>
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={`chip-btn mono ${range === r.key ? 'active' : ''}`}
                style={{ padding: '0.26rem 0.6rem', fontSize: '0.73rem' }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: compact ? 190 : 235, width: '100%', marginTop: '0.65rem' }} />
      ) : coords.length < 2 ? (
        <div
          style={{
            padding: compact ? '1.35rem 1rem' : '2rem 1.25rem',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.83rem',
            background: 'var(--bg-surface-subtle)',
            borderRadius: 10,
            marginTop: '0.65rem',
            border: '1px dashed var(--border-strong)',
          }}
        >
          {history?.message || 'Histórico real indisponível para este período na fonte gratuita.'}
        </div>
      ) : (
        <div style={{ marginTop: '0.45rem' }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair', touchAction: 'pan-y' }}
            onMouseMove={(e) => updatePointer(e.clientX, e.currentTarget)}
            onMouseLeave={() => setHoverIdx(null)}
            onTouchStart={(e) => {
              if (e.touches[0]) updatePointer(e.touches[0].clientX, e.currentTarget);
            }}
            onTouchMove={(e) => {
              if (e.touches[0]) updatePointer(e.touches[0].clientX, e.currentTarget);
            }}
            onTouchEnd={() => setHoverIdx(null)}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity="0.24" />
                <stop offset="100%" stopColor={strokeColor} stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Gridlines & Y labels */}
            {yTicks.map((val, idx) => {
              const y = padT + (idx / 2) * plotH;
              return (
                <g key={idx}>
                  <line
                    x1={padL}
                    x2={W - padR}
                    y1={y}
                    y2={y}
                    stroke="var(--border-subtle)"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padL - 8}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="10"
                    fill="var(--text-subtle)"
                    fontFamily="var(--font-mono)"
                  >
                    R$ {val.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {/* Starting price dashed baseline */}
            {baselineY != null && (
              <line
                x1={padL}
                x2={W - padR}
                y1={baselineY}
                y2={baselineY}
                stroke="var(--text-subtle)"
                strokeWidth="1"
                strokeDasharray="5 4"
                opacity="0.55"
              />
            )}

            {/* Subtle Volume Histogram Bars */}
            {hasVolume &&
              coords.map((c, idx) => {
                const barW = Math.max(2, Math.min(8, plotW / coords.length - 1.5));
                const barUp = typeof c.open === 'number' ? c.close >= c.open : isUp;
                const barColor =
                  activeMode === 'candles'
                    ? barUp
                      ? '#10b981'
                      : '#f43f5e'
                    : idx === hoverIdx
                    ? strokeColor
                    : 'var(--text-subtle)';
                return (
                  <rect
                    key={`vol-${idx}`}
                    x={c.x - barW / 2}
                    y={padT + plotH - c.volH}
                    width={barW}
                    height={c.volH}
                    rx="1.5"
                    fill={barColor}
                    opacity={idx === hoverIdx ? 0.55 : 0.16}
                  />
                );
              })}

            {/* X axis start / mid / end dates */}
            {[0, Math.floor(coords.length / 2), coords.length - 1].map((idx) => {
              const c = coords[idx];
              if (!c) return null;
              return (
                <text
                  key={idx}
                  x={c.x}
                  y={H - 6}
                  textAnchor={idx === 0 ? 'start' : idx === coords.length - 1 ? 'end' : 'middle'}
                  fontSize="10"
                  fill="var(--text-subtle)"
                  fontFamily="var(--font-mono)"
                >
                  {formatDateBr(c.date)}
                </text>
              );
            })}

            {/* Series: Area/Line OR TradingView-style OHLC Candlesticks */}
            {activeMode === 'candles' ? (
              <g>
                {coords.map((c, idx) => {
                  const bullish = typeof c.open === 'number' ? c.close >= c.open : true;
                  const cColor = bullish ? '#10b981' : '#f43f5e';
                  const bodyTop = Math.min(c.openY, c.y);
                  const bodyH = Math.max(1.5, Math.abs(c.y - c.openY));
                  return (
                    <g key={`c-${idx}`}>
                      <line
                        x1={c.x}
                        x2={c.x}
                        y1={c.highY}
                        y2={c.lowY}
                        stroke={cColor}
                        strokeWidth="1.25"
                      />
                      <rect
                        x={c.x - candleW / 2}
                        y={bodyTop}
                        width={candleW}
                        height={bodyH}
                        rx="1"
                        fill={cColor}
                        opacity={idx === hoverIdx ? 1 : 0.9}
                      />
                    </g>
                  );
                })}
              </g>
            ) : (
              <>
                <path d={areaPath} fill={`url(#${gradId})`} />
                <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="2.2" strokeLinejoin="round" />
              </>
            )}

            {/* Optional Moving Average Overlay */}
            {showSma && smaPath && (
              <path
                d={smaPath}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.75"
                strokeDasharray="4 2"
                strokeLinejoin="round"
              />
            )}

            {/* Hover crosshair + Floating Tooltip */}
            {activePoint && (
              <g style={{ pointerEvents: 'none' }}>
                <line
                  x1={activePoint.x}
                  x2={activePoint.x}
                  y1={padT}
                  y2={padT + plotH}
                  stroke="var(--text-subtle)"
                  strokeDasharray="3 3"
                />
                <line
                  x1={padL}
                  x2={W - padR}
                  y1={activePoint.y}
                  y2={activePoint.y}
                  stroke="var(--text-subtle)"
                  strokeDasharray="3 3"
                  opacity="0.55"
                />
                <circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r="5"
                  fill={strokeColor}
                  stroke="var(--bg-surface)"
                  strokeWidth="2.2"
                />
                <rect
                  x={tipX}
                  y={tipY}
                  width={tipW}
                  height={tipH}
                  rx="8"
                  fill="#0f172a"
                  stroke="rgba(255,255,255,0.16)"
                />
                <text
                  x={tipX + 10}
                  y={tipY + 17}
                  fontSize="11.5"
                  fontWeight="700"
                  fill="#ffffff"
                  fontFamily="var(--font-mono)"
                >
                  R$ {fmtBr(activePoint.close)}
                </text>
                {activeDelta != null && (
                  <text
                    x={tipX + tipW - 10}
                    y={tipY + 17}
                    textAnchor="end"
                    fontSize="10.5"
                    fontWeight="700"
                    fill={activeDelta >= 0 ? '#34d399' : '#fb7185'}
                    fontFamily="var(--font-mono)"
                  >
                    {activeDelta >= 0 ? '+' : ''}
                    {activeDelta.toFixed(1)}%
                  </text>
                )}
                <text
                  x={tipX + 10}
                  y={tipY + 34}
                  fontSize="10"
                  fill="#94a3b8"
                  fontFamily="var(--font-mono)"
                >
                  {formatDateBr(activePoint.date)}
                </text>
                {activePoint.volume > 0 && (
                  <text
                    x={tipX + 10}
                    y={tipY + 49}
                    fontSize="9.5"
                    fill="#94a3b8"
                    fontFamily="var(--font-mono)"
                  >
                    Vol: {fmtVol(activePoint.volume)}
                  </text>
                )}
              </g>
            )}
          </svg>
        </div>
      )}
    </div>
  );
}

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.65rem',
  },
  title: {
    margin: 0,
    fontSize: '0.96rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  activeReadout: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.55rem',
    flexWrap: 'wrap',
  },
  controlsWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.45rem',
    flexWrap: 'wrap',
  },
  rangeGroup: { display: 'flex', gap: '0.28rem' },
};

export default PriceChart;
