import React from 'react';
import { apiFetch } from '../api';

function fmtMacroVal(item) {
  if (item.unit === 'R$') {
    return `R$ ${Number(item.value).toFixed(4).replace('.', ',')}`;
  }
  return `${Number(item.value).toFixed(2).replace('.', ',')}${item.unit || ''}`;
}

function MacroBar({ embedded = false }) {
  const [macro, setMacro] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const controller = new AbortController();
    apiFetch('/api/macro', { signal: controller.signal })
      .then((d) => setMacro(d))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const gridClass = embedded ? 'macro-grid macro-embedded' : 'macro-grid';
  const items = macro?.indicators || [];
  if (loading) {
    return (
      <section aria-label="Carregando indicadores macroeconômicos" className={gridClass} aria-busy="true">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="macro-kpi" aria-hidden="true">
            <div className="skeleton" style={{ width: '58%', height: 11, marginBottom: 10 }} />
            <div className="skeleton" style={{ width: '44%', height: 20, marginBottom: 6 }} />
            <div className="skeleton" style={{ width: '32%', height: 9 }} />
          </div>
        ))}
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section aria-label="Indicadores macroeconômicos do Banco Central" className={gridClass} aria-live="polite">
      {items.map((item) => (
        <div
          key={item.key}
          className="macro-kpi"
          title={`Fonte oficial: Banco Central (SGS) · Referência ${item.ref_date}`}
        >
          <div style={styles.topRow}>
            <span style={styles.name}>{item.name}</span>
            <span style={styles.badge}>BCB</span>
          </div>
          <div className="num" style={styles.val}>
            {fmtMacroVal(item)}
          </div>
          <div className="mono" style={styles.date}>
            Ref. {item.ref_date}
          </div>
        </div>
      ))}
    </section>
  );
}

const styles = {
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.4rem',
  },
  name: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  badge: {
    fontSize: '0.62rem',
    fontWeight: 800,
    color: 'var(--text-subtle)',
    background: 'var(--bg-surface-subtle)',
    border: '1px solid var(--border-subtle)',
    padding: '0.08rem 0.38rem',
    borderRadius: '4px',
  },
  val: {
    fontSize: '1.22rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
    letterSpacing: '-0.02em',
  },
  date: {
    fontSize: '0.68rem',
    color: 'var(--text-subtle)',
  },
};

export default MacroBar;
