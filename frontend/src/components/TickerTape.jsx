import React from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api';

function TickerTape() {
  const navigate = useNavigate();
  const [items, setItems] = React.useState([]);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      apiFetch('/api/market', { signal: controller.signal }).catch(() => null),
      apiFetch('/api/macro', { signal: controller.signal }).catch(() => null),
    ]).then(([market, macro]) => {
      if (controller.signal.aborted) return;
      const list = [];

      if (market?.ibovespa) {
        list.push({
          key: 'ibov',
          label: market.ibovespa.isProxy ? 'B3 TOP 50' : market.ibovespa.name,
          price: null,
          change: market.ibovespa.change,
          to: '/acoes',
        });
      }

      for (const m of macro?.indicators || []) {
        if (m.key === 'ptax_usd' || m.key === 'selic') {
          list.push({
            key: `macro-${m.key}`,
            label: m.key === 'ptax_usd' ? 'DÓLAR PTAX' : 'SELIC',
            price:
              m.unit === 'R$'
                ? `R$ ${Number(m.value).toFixed(2).replace('.', ',')}`
                : `${Number(m.value).toFixed(2).replace('.', ',')}%`,
            change: null,
            to: null,
          });
        }
      }

      const stocks = (market?.heatmap || []).slice(0, 14);
      for (const s of stocks) {
        list.push({
          key: s.symbol,
          label: s.symbol,
          price: typeof s.price === 'number' ? `R$ ${s.price.toFixed(2).replace('.', ',')}` : null,
          change: typeof s.change === 'number' ? s.change : null,
          to: `/acoes/${s.symbol}`,
        });
      }

      setItems(list);
    });
    return () => controller.abort();
  }, []);

  if (items.length === 0) return null;

  // Duplicate list for seamless infinite CSS marquee (-50% loop)
  const trackItems = [...items, ...items];

  return (
    <div className="ticker-tape" aria-label="Cotações em tempo real da B3">
      <button
        type="button"
        className="ticker-control"
        onClick={() => setPaused((p) => !p)}
        title={paused ? 'Retomar carrossel de cotações' : 'Pausar carrossel de cotações'}
        aria-label={paused ? 'Retomar carrossel de cotações' : 'Pausar carrossel de cotações'}
        aria-pressed={paused}
      >
        <span className="live-dot" style={{ width: 6, height: 6, opacity: paused ? 0.35 : 1 }} />
        <span className="mono" style={{ fontSize: '0.67rem', fontWeight: 700 }}>
          {paused ? '▶' : '⏸'}
        </span>
      </button>

      <div className="ticker-viewport">
        <div className={`ticker-track ${paused ? 'is-paused' : ''}`}>
          {trackItems.map((it, idx) => {
            const isDuplicate = idx >= items.length;
            const isPos = (it.change ?? 0) >= 0;
            const Tag = it.to ? 'button' : 'span';
            return (
              <Tag
                key={`${it.key}-${idx}`}
                type={it.to ? 'button' : undefined}
                tabIndex={isDuplicate ? -1 : undefined}
                aria-hidden={isDuplicate ? 'true' : undefined}
                className={`ticker-item ${it.to ? 'ticker-clickable' : ''}`}
                onClick={it.to ? () => navigate(it.to) : undefined}
              >
                <span className="ticker-sym mono">{it.label}</span>
                {it.price && <span className="ticker-price num">{it.price}</span>}
                {it.change != null && (
                  <span className={`ticker-chg num ${isPos ? 'pos' : 'neg'}`}>
                    {isPos ? '▲ +' : '▼ '}
                    {Math.abs(it.change).toFixed(2).replace('.', ',')}%
                  </span>
                )}
              </Tag>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default TickerTape;
