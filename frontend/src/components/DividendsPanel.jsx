import React from 'react';
import { apiFetch } from '../api';
import { BarChartIcon } from './Icons';

function fmtDate(iso) {
  if (!iso || iso.length < 10) return iso || '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function humanDivSource(src) {
  if (!src) return 'Fonte oficial';
  if (src === 'brapi-live') return 'B3 / Brapi';
  if (src.startsWith('CVM')) return src;
  return src;
}

function DividendsPanel({ symbol }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    apiFetch(`/api/assets/${encodeURIComponent(symbol)}/dividends`, { signal: controller.signal })
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setData(null);
        setLoading(false);
      });
    return () => controller.abort();
  }, [symbol]);

  if (loading) {
    return (
      <div className="card" style={{ padding: '1.35rem' }}>
        <div className="skeleton" style={{ height: 180, width: '100%' }} />
      </div>
    );
  }

  const rows = data?.dividends || [];
  const byYear = data?.byYear || [];
  const maxYearTotal = Math.max(...byYear.map((y) => y.total), 0.01);

  if (rows.length === 0) {
    return (
      <div className="card" style={{ padding: '2.25rem 1.5rem', textAlign: 'center' }}>
        <h3 style={{ margin: '0 0 0.45rem 0', fontSize: '1rem', color: 'var(--text-primary)' }}>
          Histórico de proventos ainda não disponível para {symbol}
        </h3>
        <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)', maxWidth: 520, marginInline: 'auto', lineHeight: 1.55 }}>
          Exibimos apenas pagamentos oficiais confirmados, sem estimativas artificiais. Atualmente, os proventos detalhados estão ativos no plano gratuito para <strong>PETR4, VALE3, ITUB4 e MGLU3</strong>.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Summary + Annual Bar Chart */}
      <div className="card" style={{ padding: '1.35rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#10b981', display: 'flex' }}><BarChartIcon size={18} /></span>
            Proventos Pagos por Ano ({symbol})
          </h3>
          {data.total12m != null && (
            <span className="pill pill-pos num" style={{ fontSize: '0.82rem', padding: '0.3rem 0.7rem' }}>
              Últimos 12m: R$ {data.total12m.toFixed(2).replace('.', ',')} / ação
            </span>
          )}
        </div>

        {byYear.length > 0 && (
          <div style={styles.barsWrap}>
            {byYear.map((item) => {
              const pct = Math.max(8, (item.total / maxYearTotal) * 100);
              return (
                <div key={item.year} style={styles.barCol}>
                  <span className="num" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    R$ {item.total.toFixed(2).replace('.', ',')}
                  </span>
                  <div style={styles.barTrack}>
                    <div
                      style={{
                        width: '100%',
                        maxWidth: 46,
                        height: `${pct}%`,
                        background: 'linear-gradient(180deg, #10b981, #059669)',
                        borderRadius: '6px 6px 0 0',
                      }}
                    />
                  </div>
                  <span className="mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                    {item.year}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Table of payments */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '0.9rem 1.15rem', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Histórico Detalhado de Proventos ({rows.length} registros reais)
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 360 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Data de Pagamento</th>
                <th>Tipo</th>
                <th style={{ textAlign: 'right' }}>Valor por Ação</th>
                <th>Fonte</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={`${r.pay_date}-${r.type}-${idx}`}>
                  <td className="mono">{fmtDate(r.pay_date)}</td>
                  <td>
                    <span className={`pill ${r.type.includes('JCP') ? 'pill-brand' : 'pill-pos'}`}>
                      {r.type}
                    </span>
                  </td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--positive)' }}>
                    R$ {Number(r.amount).toFixed(4).replace('.', ',')}
                  </td>
                  <td style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{humanDivSource(r.source)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const styles = {
  barsWrap: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    gap: '0.75rem',
    height: '185px',
    paddingTop: '0.5rem',
  },
  barCol: {
    flex: 1,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.35rem',
  },
  barTrack: {
    flex: 1,
    width: '100%',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
};

export default DividendsPanel;

