import React from 'react';
import { useNavigate } from 'react-router-dom';

function tileBackground(change) {
  const c = change ?? 0;
  if (c >= 3) return '#065f46';
  if (c >= 1.2) return '#047857';
  if (c > 0) return '#0f766e';
  if (c === 0) return '#475569';
  if (c > -1.2) return '#be123c';
  if (c > -3) return '#9f1239';
  return '#881337';
}

function MarketHeatmap({ items = [] }) {
  const navigate = useNavigate();
  if (!items || items.length === 0) return null;

  return (
    <div className="card" style={{ padding: '1.15rem' }}>
      <div style={styles.legendRow}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Top {items.length} companhias por valor de mercado
        </span>
        <div style={styles.scale}>
          <span style={{ ...styles.scaleChip, background: '#881337' }}>≤ -3%</span>
          <span style={{ ...styles.scaleChip, background: '#be123c' }}>-1%</span>
          <span style={{ ...styles.scaleChip, background: '#475569' }}>0%</span>
          <span style={{ ...styles.scaleChip, background: '#0f766e' }}>+1%</span>
          <span style={{ ...styles.scaleChip, background: '#065f46' }}>≥ +3%</span>
        </div>
      </div>

      <div className="heatmap-grid">
        {items.map((item, idx) => {
          const ch = item.change ?? 0;
          const isBig = idx < 3;
          return (
            <div
              key={item.symbol}
              role="button"
              tabIndex={0}
              className={`heatmap-tile ${isBig ? 'heatmap-tile-lg' : ''}`}
              style={{ background: tileBackground(ch) }}
              onClick={() => navigate(`/acoes/${item.symbol}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/acoes/${item.symbol}`);
                }
              }}
              aria-label={`Analisar ${item.symbol}, variação ${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%`}
              title={`${item.symbol} — ${item.name} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%)`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.35rem' }}>
                <strong className="mono" style={{ fontSize: isBig ? '1rem' : '0.88rem' }}>
                  {item.symbol}
                </strong>
                <span className="num" style={{ fontSize: isBig ? '0.9rem' : '0.78rem', fontWeight: 800 }}>
                  {ch >= 0 ? '+' : ''}{ch.toFixed(2).replace('.', ',')}%
                </span>
              </div>
              <div style={styles.tileFooter}>
                <span style={styles.tileName}>{item.name}</span>
                <span className="num" style={{ fontSize: '0.72rem', opacity: 0.92 }}>
                  {item.price != null ? `R$ ${item.price.toFixed(2).replace('.', ',')}` : '—'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  legendRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginBottom: '0.85rem',
  },
  scale: { display: 'flex', gap: '0.25rem', alignItems: 'center' },
  scaleChip: {
    color: '#fff',
    fontSize: '0.66rem',
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    padding: '0.15rem 0.4rem',
    borderRadius: '4px',
  },
  tileFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: '0.4rem',
    marginTop: '0.5rem',
  },
  tileName: {
    fontSize: '0.68rem',
    opacity: 0.85,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};

export default MarketHeatmap;
