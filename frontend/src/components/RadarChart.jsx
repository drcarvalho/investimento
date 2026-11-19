import React from 'react';

const PALETTE = ['#0f766e', '#10b981', '#f59e0b', '#ec4899'];

const AXES = [
  {
    key: 'valuation',
    label: 'Valuation',
    score: (s) => {
      const pl = s.valuation?.pl;
      if (!pl || pl <= 0) return 15;
      if (pl <= 6) return 100;
      if (pl <= 12) return 82;
      if (pl <= 20) return 60;
      if (pl <= 30) return 40;
      return 22;
    },
  },
  {
    key: 'dividendos',
    label: 'Dividendos',
    score: (s) => {
      const dy = s.valuation?.dividendYield ?? 0;
      return Math.min(100, Math.max(10, Math.round((dy / 12) * 100)));
    },
  },
  {
    key: 'roe',
    label: 'Rentabilidade',
    score: (s) => {
      const roe = s.rentabilidade?.roe ?? 0;
      if (roe <= 0) return 10;
      return Math.min(100, Math.round((roe / 28) * 100));
    },
  },
  {
    key: 'margem',
    label: 'Margem Líq.',
    score: (s) => {
      const ml = s.rentabilidade?.margemLiquida ?? 0;
      if (ml <= 0) return 10;
      return Math.min(100, Math.round((ml / 30) * 100));
    },
  },
  {
    key: 'saude',
    label: 'Saúde Fin.',
    score: (s) => {
      const d = s.endividamento?.dividaLiquidaEbitda;
      if (d == null) return 75; // bancos / sem dívida líquida reportada
      if (d <= 0) return 100;
      if (d <= 1.5) return 85;
      if (d <= 2.5) return 68;
      if (d <= 3.5) return 45;
      return 20;
    },
  },
];

function RadarChart({ stocks = [] }) {
  if (!stocks || stocks.length === 0) return null;

  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 112;
  const levels = [25, 50, 75, 100];

  const angleFor = (idx) => (Math.PI * 2 * idx) / AXES.length - Math.PI / 2;

  const pointAt = (idx, pct) => {
    const a = angleFor(idx);
    const r = (pct / 100) * maxR;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };

  return (
    <div className="card" style={styles.wrap}>
      <div style={{ flex: '1 1 280px' }}>
        <h3 style={styles.title}>Radar Fundamentalista (5 Pilares)</h3>
        <p style={styles.desc}>
          Visualização normalizada (0–100) comparando Valuation, Dividendos, Rentabilidade (ROE), Margem Líquida e Saúde Financeira.
        </p>

        <div style={styles.legend}>
          {stocks.map((s, idx) => (
            <div key={s.symbol} style={styles.legendItem}>
              <span style={{ ...styles.swatch, background: PALETTE[idx % PALETTE.length] }} />
              <strong className="mono" style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                {s.symbol}
              </strong>
              <span className="num" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                ({s.viability?.score ?? '—'} pts)
              </span>
            </div>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: 310, height: 'auto', flexShrink: 0 }}>
        {/* Concentric pentagons */}
        {levels.map((lv) => {
          const pts = AXES.map((_, i) => pointAt(i, lv).join(',')).join(' ');
          return (
            <polygon
              key={lv}
              points={pts}
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth="1"
            />
          );
        })}

        {/* Axis spokes & labels */}
        {AXES.map((ax, i) => {
          const [x2, y2] = pointAt(i, 100);
          const [lx, ly] = pointAt(i, 122);
          return (
            <g key={ax.key}>
              <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="var(--border-subtle)" strokeWidth="1" />
              <text
                x={lx}
                y={ly + 3}
                textAnchor="middle"
                fontSize="10.5"
                fontWeight="700"
                fill="var(--text-secondary)"
              >
                {ax.label}
              </text>
            </g>
          );
        })}

        {/* Stock polygons */}
        {stocks.map((s, sIdx) => {
          const color = PALETTE[sIdx % PALETTE.length];
          const pts = AXES.map((ax, i) => pointAt(i, ax.score(s)).join(',')).join(' ');
          return (
            <g key={s.symbol}>
              <polygon
                points={pts}
                fill={color}
                fillOpacity="0.16"
                stroke={color}
                strokeWidth="2.2"
              />
              {AXES.map((ax, i) => {
                const [px, py] = pointAt(i, ax.score(s));
                return <circle key={ax.key} cx={px} cy={py} r="3.5" fill={color} />;
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const styles = {
  wrap: {
    padding: '1.25rem 1.4rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '1.5rem',
    marginBottom: '1.25rem',
  },
  title: {
    margin: '0 0 0.35rem 0',
    fontSize: '1.02rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  desc: {
    margin: '0 0 1rem 0',
    fontSize: '0.84rem',
    color: 'var(--text-muted)',
    lineHeight: 1.5,
    maxWidth: '420px',
  },
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.65rem 1.15rem',
  },
  legendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  swatch: {
    width: '12px',
    height: '12px',
    borderRadius: '3px',
    display: 'inline-block',
  },
};

export default RadarChart;

