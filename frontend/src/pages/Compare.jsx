import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ScaleIcon, TrophyIcon, XIcon, TrendingUpIcon, BuildingIcon, PrinterIcon } from '../components/Icons';
import ViabilityBadge from '../components/ViabilityBadge';
import RadarChart from '../components/RadarChart';
import StockLogo from '../components/StockLogo';
import { showToast } from '../components/Toast';
import { apiFetch } from '../api';
import { sanitizeTicker } from '../utils/security';

const LINE_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

function fmt(v, dec = 2, suffix = '') {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return `${Number(v).toFixed(dec).replace('.', ',')}${suffix}`;
}

function fmtMoney(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  if (Math.abs(v) >= 1e9) return `R$ ${(v / 1e9).toFixed(2).replace('.', ',')} B`;
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toFixed(2).replace('.', ',')} M`;
  return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const METRICS = [
  { group: 'Mercado', label: 'Cotação Atual', get: (s) => s.price, format: (v) => (v != null ? `R$ ${fmt(v)}` : '—'), best: null },
  { group: 'Mercado', label: 'Variação Dia', get: (s) => s.change, format: (v) => (v != null ? `${v >= 0 ? '+' : ''}${fmt(v, 2, '%')}` : '—'), best: 'max' },
  { group: 'Valuation', label: 'P/L (menor positivo)', get: (s) => (s.valuation?.pl > 0 ? s.valuation.pl : null), format: (v) => fmt(v), best: 'min' },
  { group: 'Valuation', label: 'P/VP (menor positivo)', get: (s) => (s.valuation?.pvp > 0 ? s.valuation.pvp : null), format: (v) => fmt(v), best: 'min' },
  { group: 'Valuation', label: 'Dividend Yield (12m)', get: (s) => s.valuation?.dividendYield, format: (v) => fmt(v, 2, '%'), best: 'max' },
  { group: 'Valuation', label: 'EV / EBITDA', get: (s) => (s.valuation?.evEbitda > 0 ? s.valuation.evEbitda : null), format: (v) => fmt(v), best: 'min' },
  { group: 'Rentabilidade', label: 'ROE', get: (s) => s.rentabilidade?.roe, format: (v) => fmt(v, 2, '%'), best: 'max' },
  { group: 'Rentabilidade', label: 'ROIC', get: (s) => s.rentabilidade?.roic, format: (v) => fmt(v, 2, '%'), best: 'max' },
  { group: 'Rentabilidade', label: 'Margem Líquida', get: (s) => s.rentabilidade?.margemLiquida, format: (v) => fmt(v, 2, '%'), best: 'max' },
  { group: 'Crescimento', label: 'Crescimento de Receita', get: (s) => s.crescimento?.receita, format: (v) => (v != null ? `${v >= 0 ? '+' : ''}${fmt(v, 1, '%')}` : '—'), best: 'max' },
  { group: 'Crescimento', label: 'Crescimento de Lucro', get: (s) => s.crescimento?.lucro, format: (v) => (v != null ? `${v >= 0 ? '+' : ''}${fmt(v, 1, '%')}` : '—'), best: 'max' },
  { group: 'Endividamento', label: 'Dívida Líquida (R$)', get: (s) => s.endividamento?.dividaLiquida, format: (v) => fmtMoney(v), best: 'min' },
  { group: 'Endividamento', label: 'Dív. Líquida / EBITDA', get: (s) => s.endividamento?.dividaLiquidaEbitda, format: (v) => fmt(v), best: 'min' },
  { group: 'Preço Justo', label: 'Valor Intrínseco (Graham)', get: (s) => s.fairValue?.grahamPrice, format: (v) => (v != null ? `R$ ${fmt(v)}` : '—'), best: null },
  { group: 'Preço Justo', label: 'Margem Graham (%)', get: (s) => s.fairValue?.grahamUpside, format: (v) => (v != null ? `${v >= 0 ? '+' : ''}${fmt(v, 1, '%')}` : '—'), best: 'max' },
  { group: 'Saúde', label: 'Score Fundamentalista', get: (s) => s.viability?.score, format: (v) => (v != null ? `${v}/100` : '—'), best: 'max' },
];

function MultiHistoryChart({ tickers }) {
  const [range, setRange] = React.useState('3mo');
  const [series, setSeries] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (tickers.length === 0) return;
    const controller = new AbortController();
    setLoading(true);
    Promise.all(
      tickers.map((t) =>
        apiFetch(`/api/indicators/${encodeURIComponent(t)}/history?range=${range}`, { signal: controller.signal })
          .catch(() => ({ symbol: t, points: [], source: 'unavailable' }))
      )
    ).then((res) => {
      if (controller.signal.aborted) return;
      setSeries(res.filter((s) => s.points && s.points.length > 1));
      setLoading(false);
    });
    return () => controller.abort();
  }, [tickers, range]);

  const W = 760;
  const H = 220;
  const padL = 48;
  const padR = 16;
  const padT = 18;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Normalize each series to Base 100 (cumulative % return from first day of period)
  const normalized = series.map((s, idx) => {
    const first = s.points[0].close || 1;
    const pts = s.points.map((p) => ({
      date: p.date,
      pct: ((p.close - first) / first) * 100,
    }));
    return {
      symbol: s.symbol,
      color: LINE_COLORS[idx % LINE_COLORS.length],
      pts,
      finalPct: pts[pts.length - 1].pct,
    };
  });

  const allPcts = normalized.flatMap((s) => s.pts.map((p) => p.pct));
  const minPct = allPcts.length ? Math.min(0, ...allPcts) : -5;
  const maxPct = allPcts.length ? Math.max(0, ...allPcts) : 5;
  const span = maxPct - minPct || 1;
  const zeroY = padT + plotH - ((0 - minPct) / span) * plotH;

  return (
    <div className="card" style={{ padding: '1.25rem 1.35rem', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--brand)', display: 'flex' }}><TrendingUpIcon size={17} /></span>
            Evolução Histórica Comparada (Retorno % Acumulado)
          </h3>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Exibe apenas ativos com série histórica real disponível (sem dados inventados).
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {['1mo', '3mo', '6mo', '1y'].map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`chip-btn mono ${range === r ? 'active' : ''}`} style={{ padding: '0.26rem 0.65rem', fontSize: '0.74rem' }}>
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 195 }} />
      ) : normalized.length === 0 ? (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
          Nenhum dos ativos selecionados possui histórico real carregado no momento. (Ativos gratuitos com histórico ao vivo: PETR4, VALE3, ITUB4, MGLU3.)
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', marginBottom: '0.65rem' }}>
            {normalized.map((s) => (
              <span key={s.symbol} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
                <span className="mono">{s.symbol}</span>
                <span className="num" style={{ color: s.finalPct >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                  ({s.finalPct >= 0 ? '+' : ''}{s.finalPct.toFixed(1)}%)
                </span>
              </span>
            ))}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            {[maxPct, 0, minPct].map((val, i) => {
              const y = padT + plotH - ((val - minPct) / span) * plotH;
              return (
                <g key={i}>
                  <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="var(--border-subtle)" strokeDasharray={val === 0 ? '5 4' : '2 3'} />
                  <text x={padL - 6} y={y + 3.5} textAnchor="end" fontSize="10" fill="var(--text-subtle)" fontFamily="var(--font-mono)">
                    {val >= 0 ? '+' : ''}{val.toFixed(0)}%
                  </text>
                </g>
              );
            })}
            <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="var(--text-subtle)" strokeWidth="1" opacity="0.5" />

            {normalized.map((s) => {
              const path = s.pts
                .map((p, idx) => {
                  const x = padL + (idx / Math.max(1, s.pts.length - 1)) * plotW;
                  const y = padT + plotH - ((p.pct - minPct) / span) * plotH;
                  return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(' ');
              return <path key={s.symbol} d={path} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" />;
            })}
          </svg>
        </>
      )}
    </div>
  );
}

function buildInterpretation(stocks) {
  if (stocks.length < 2) return [];
  const notes = [];

  const withPl = stocks.filter((s) => s.valuation?.pl > 0).sort((a, b) => a.valuation.pl - b.valuation.pl);
  if (withPl.length >= 2) {
    notes.push(`Menor P/L positivo: ${withPl[0].symbol} (${fmt(withPl[0].valuation.pl)}x), indicando múltiplo de lucro mais descontado frente a ${withPl[withPl.length - 1].symbol} (${fmt(withPl[withPl.length - 1].valuation.pl)}x).`);
  }

  const withRoe = stocks.filter((s) => typeof s.rentabilidade?.roe === 'number').sort((a, b) => b.rentabilidade.roe - a.rentabilidade.roe);
  if (withRoe.length >= 2) {
    notes.push(`Maior rentabilidade sobre patrimônio (ROE): ${withRoe[0].symbol} (${fmt(withRoe[0].rentabilidade.roe, 1, '%')}).`);
  }

  const withDy = stocks.filter((s) => typeof s.valuation?.dividendYield === 'number').sort((a, b) => b.valuation.dividendYield - a.valuation.dividendYield);
  if (withDy.length >= 2 && withDy[0].valuation.dividendYield > 0) {
    notes.push(`Maior Dividend Yield (12m): ${withDy[0].symbol} (${fmt(withDy[0].valuation.dividendYield, 2, '%')}).`);
  }

  const withDebt = stocks.filter((s) => typeof s.endividamento?.dividaLiquidaEbitda === 'number').sort((a, b) => a.endividamento.dividaLiquidaEbitda - b.endividamento.dividaLiquidaEbitda);
  if (withDebt.length >= 2) {
    notes.push(`Menor alavancagem operacional (Dív. Líq./EBITDA): ${withDebt[0].symbol} (${fmt(withDebt[0].endividamento.dividaLiquidaEbitda)}x).`);
  }

  const withGrowth = stocks.filter((s) => typeof s.crescimento?.receita === 'number').sort((a, b) => b.crescimento.receita - a.crescimento.receita);
  if (withGrowth.length >= 2) {
    notes.push(`Maior crescimento de receita reportado: ${withGrowth[0].symbol} (${withGrowth[0].crescimento.receita >= 0 ? '+' : ''}${fmt(withGrowth[0].crescimento.receita, 1, '%')}).`);
  }

  return notes;
}

function Compare() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialTickers = (searchParams.get('tickers') || 'PETR4,VALE3,ITUB4')
    .split(',')
    .map(sanitizeTicker)
    .filter(Boolean)
    .slice(0, 5);

  const [tickers, setTickers] = React.useState(initialTickers);
  const [available, setAvailable] = React.useState([]);
  const [newTicker, setNewTicker] = React.useState('');
  const [dataList, setDataList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiFetch('/api/indicators')
      .then((j) => setAvailable((j.stocks || []).map((s) => s.symbol).sort()))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    setSearchParams({ tickers: tickers.join(',') }, { replace: true });
    if (tickers.length === 0) {
      setDataList([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    Promise.all(
      tickers.map((t) =>
        apiFetch(`/api/indicators/${encodeURIComponent(t)}`, { signal: controller.signal }).catch(() => null)
      )
    ).then((results) => {
      if (controller.signal.aborted) return;
      setDataList(results.filter(Boolean));
      setLoading(false);
    });
    return () => controller.abort();
  }, [tickers, setSearchParams]);

  const addTicker = (e) => {
    e.preventDefault();
    const t = sanitizeTicker(newTicker);
    if (!t) {
      showToast('Ticker inválido (ex: BBAS3, WEGE3).', 'error');
      return;
    }
    if (tickers.includes(t) || tickers.length >= 5) return;
    setTickers([...tickers, t]);
    setNewTicker('');
  };

  const removeTicker = (t) => setTickers(tickers.filter((x) => x !== t));

  const loadSectorPeers = async () => {
    const anchor = tickers[0];
    if (!anchor) return;
    try {
      const res = await apiFetch(`/api/intelligence/sector-peers/${encodeURIComponent(anchor)}`);
      const peerSymbols = (res.peers || []).map((p) => p.symbol).slice(0, 4);
      if (peerSymbols.length === 0) {
        showToast(`Nenhum par do mesmo setor encontrado para ${anchor}.`, 'info');
        return;
      }
      setTickers([anchor, ...peerSymbols].slice(0, 5));
      showToast(`Comparando ${anchor} com pares do setor ${res.sector}!`, 'success');
    } catch {
      showToast('Não foi possível carregar pares do setor.', 'error');
    }
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      showToast('Link da comparação copiado!', 'success');
    });
  };

  const interpretations = buildInterpretation(dataList);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <div>
          <span className="page-eyebrow">Comparação Lado a Lado</span>
          <h1 style={styles.title}>
            <span style={{ color: 'var(--brand)', display: 'inline-flex' }}><ScaleIcon size={22} /></span>
            Comparador de Investimentos
          </h1>
          <p style={styles.subtitle}>
            Avalie até 5 ativos simultaneamente por múltiplos, rentabilidade, crescimento, dívida líquida, retorno histórico e pares do setor.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {tickers[0] && (
            <button className="btn btn-primary" onClick={loadSectorPeers} style={{ fontSize: '0.8rem' }}>
              <BuildingIcon size={14} /> Pares do setor de {tickers[0]}
            </button>
          )}
          {tickers.length > 0 && (
            <>
              <button className="btn btn-ghost" onClick={copyLink} style={{ fontSize: '0.8rem' }}>
                Copiar link
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => window.print()} style={{ fontSize: '0.8rem' }}>
                <PrinterIcon size={14} /> Imprimir / PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Selector Bar */}
      <div className="card" style={styles.selectorBar}>
        <div style={styles.chipsWrap}>
          {tickers.map((t, idx) => (
            <span
              key={t}
              className="pill mono"
              style={{
                padding: '0.35rem 0.7rem',
                fontSize: '0.82rem',
                background: `${LINE_COLORS[idx % LINE_COLORS.length]}18`,
                color: LINE_COLORS[idx % LINE_COLORS.length],
                border: `1px solid ${LINE_COLORS[idx % LINE_COLORS.length]}44`,
              }}
            >
              {t}
              <button
                onClick={() => removeTicker(t)}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', padding: 0 }}
                title={`Remover ${t}`}
                aria-label={`Remover ${t} da comparação`}
              >
                <XIcon size={13} />
              </button>
            </span>
          ))}
        </div>

        {tickers.length < 5 && (
          <form onSubmit={addTicker} style={styles.addForm}>
            <select
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v && !tickers.includes(v)) setTickers([...tickers, v]);
              }}
              className="field-input"
              style={{ width: 'auto', minWidth: 165 }}
            >
              <option value="">+ Escolher ação...</option>
              {available
                .filter((sym) => !tickers.includes(sym))
                .map((sym) => (
                  <option key={sym} value={sym}>{sym}</option>
                ))}
            </select>
            <input
              type="text"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value)}
              placeholder="Ou digite ticker..."
              className="field-input"
              style={{ width: 155 }}
            />
            <button type="submit" className="btn btn-primary">Adicionar</button>
          </form>
        )}
      </div>

      {/* Normalized Historical Evolution */}
      {!loading && tickers.length >= 1 && <MultiHistoryChart tickers={tickers} />}

      {/* Radar Fundamentalista */}
      {!loading && dataList.length >= 2 && <RadarChart stocks={dataList.slice(0, 4)} />}

      {/* Data-driven Interpretation */}
      {!loading && interpretations.length > 0 && (
        <div className="card" style={{ padding: '1.15rem 1.35rem', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '0.96rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Resumo Comparativo
          </h3>
          <p style={{ margin: '0 0 0.65rem 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Síntese automática calculada exclusivamente a partir dos indicadores disponíveis.
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
            {interpretations.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Comparison Matrix */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ height: 38, width: '100%' }} />)}
          </div>
        ) : dataList.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Adicione ativos acima para começar a comparação.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: '700px' }}>
              <thead>
                <tr>
                  <th className="sticky-col" style={{ width: '220px' }}>Indicador</th>
                  {dataList.map((s) => (
                    <th key={s.symbol} style={{ textAlign: 'center', padding: '1rem 0.75rem' }}>
                      <div
                        style={styles.stockHeaderCell}
                        onClick={() => navigate(`/acoes/${s.symbol}`)}
                        title={`Abrir análise completa de ${s.symbol}`}
                      >
                        <StockLogo src={s.logo} symbol={s.symbol} size={38} radius={9} />
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{s.symbol}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'none' }}>{s.sector}</div>
                        <div style={{ marginTop: 4 }}>
                          <ViabilityBadge viability={s.viability} />
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((m) => {
                  const rawValues = dataList.map((s) => m.get(s));
                  const validNums = rawValues.filter((v) => typeof v === 'number' && !isNaN(v));
                  let bestVal = null;
                  if (m.best === 'max' && validNums.length > 1) bestVal = Math.max(...validNums);
                  if (m.best === 'min' && validNums.length > 1) bestVal = Math.min(...validNums);

                  return (
                    <tr key={m.label}>
                      <td className="sticky-col" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                        <div style={{ fontSize: '0.64rem', textTransform: 'uppercase', color: 'var(--text-subtle)', fontWeight: 700 }}>
                          {m.group}
                        </div>
                        {m.label}
                      </td>
                      {dataList.map((s, idx) => {
                        const val = rawValues[idx];
                        const isBest = bestVal !== null && val === bestVal;
                        return (
                          <td
                            key={s.symbol}
                            className="num"
                            style={{
                              textAlign: 'center',
                              background: isBest ? 'var(--positive-soft)' : 'transparent',
                              color: val == null ? 'var(--text-subtle)' : isBest ? 'var(--positive)' : 'var(--text-primary)',
                              fontWeight: isBest ? 800 : 600,
                            }}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                              {m.format(val)}
                              {isBest && <TrophyIcon size={13} />}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  title: {
    margin: '0 0 0.25rem 0',
    fontSize: '1.45rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    letterSpacing: '-0.02em',
  },
  subtitle: { margin: '0 0 1rem 0', fontSize: '0.88rem', color: 'var(--text-muted)' },
  selectorBar: {
    padding: '0.95rem 1.15rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.85rem',
    marginBottom: '1.25rem',
  },
  chipsWrap: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
  addForm: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' },
  stockHeaderCell: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', cursor: 'pointer' },
};

export default Compare;
