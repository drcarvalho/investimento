import React from 'react';
import { apiFetch } from '../api';
import { formatDateBr } from '../utils/format';
import { safeHttpUrl } from '../utils/security';

export default function CorporateEventsPanel({ symbol }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch(`/api/assets/${encodeURIComponent(symbol)}/events`)
      .then((res) => {
        if (!active) return;
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [symbol]);

  if (loading) {
    return (
      <div className="card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 52 }} />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-banner" role="alert">
        <span>Não foi possível carregar os comunicados da CVM: {error}</span>
      </div>
    );
  }

  const events = data?.events || [];

  return (
    <div className="card" style={{ padding: '1.35rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <div>
          <h2 className="section-title" style={{ margin: 0, fontSize: '1.05rem' }}>
            Fatos Relevantes &amp; Comunicados Oficiais (CVM)
          </h2>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Documentos públicos registrados pela companhia no sistema IPE da CVM.
          </p>
        </div>
        <span className="pill pill-neutral num" style={{ fontSize: '0.72rem' }}>
          {events.length} registro(s)
        </span>
      </div>

      {events.length === 0 ? (
        <div style={{ padding: '1.75rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Nenhum comunicado da CVM sincronizado para <strong className="mono">{symbol}</strong> ainda. Execute o motor diário com <code>--with-events</code> para carregar os documentos IPE oficiais.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {events.map((ev, idx) => {
            const href = safeHttpUrl(ev.link);
            const isFato = String(ev.category || '').toLowerCase().includes('fato relevante');
            return (
              <div
                key={`${ev.date}-${ev.category}-${idx}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                  flexWrap: 'wrap',
                  padding: '0.85rem 0',
                  borderTop: idx > 0 ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: 4 }}>
                    <span className={`pill ${isFato ? 'pill-warn' : 'pill-neutral'}`} style={{ fontSize: '0.68rem' }}>
                      {ev.category}
                    </span>
                    <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
                      {formatDateBr(ev.date)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {ev.subject}
                  </div>
                </div>
                {href && (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost"
                    style={{ fontSize: '0.76rem', textDecoration: 'none' }}
                  >
                    Abrir na CVM
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
