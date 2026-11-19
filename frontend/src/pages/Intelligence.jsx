import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheckIcon, TrendingDownIcon, BarChartIcon, CheckCircleIcon, RefreshIcon, ScaleIcon } from '../components/Icons';
import StockLogo from '../components/StockLogo';
import { showToast } from '../components/Toast';
import { apiFetch } from '../api';

function fmt(v, dec = 2, suffix = '') {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return `${Number(v).toFixed(dec).replace('.', ',')}${suffix}`;
}

function humanSource(src) {
  if (!src) return 'Base Fundamentalista';
  if (src === 'brapi-live') return 'B3 ao vivo';
  if (src.startsWith('CVM')) return src;
  if (src === 'bolsai') return 'Bolsai / CVM';
  if (src === 'static-baseline') return 'Base Fundamentalista';
  return 'Análise Quantitativa';
}

function scoreColor(score) {
  if (score >= 76) return '#10b981';
  if (score >= 62) return '#0284c7';
  if (score >= 45) return '#f59e0b';
  return '#f43f5e';
}

function Intelligence() {
  const navigate = useNavigate();
  const canRunEngine = !import.meta.env.PROD;
  const [tab, setTab] = React.useState('oportunidades');
  const [rankData, setRankData] = React.useState(null);
  const [recData, setRecData] = React.useState(null);
  const [sectorFilter, setSectorFilter] = React.useState('Todos');
  const [loading, setLoading] = React.useState(true);
  const [runningEngine, setRunningEngine] = React.useState(false);
  const [error, setError] = React.useState(null);

  const runEngineNow = async () => {
    setRunningEngine(true);
    try {
      await apiFetch('/api/intelligence/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        timeoutMs: 65000,
      });
      showToast('Análises atualizadas! Rankings, FIIs e radar diário renovados.', 'success');
      loadAll();
    } catch (err) {
      showToast(err.message || 'Não foi possível recalcular as análises agora.', 'error');
    } finally {
      setRunningEngine(false);
    }
  };

  const loadAll = React.useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch('/api/intelligence/rankings'),
      apiFetch('/api/intelligence/recommendations'),
    ])
      .then(([rk, rc]) => {
        setRankData(rk);
        setRecData(rc);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  const allRankings = rankData?.rankings || [];
  const rankings = allRankings.filter(
    (r) => sectorFilter === 'Todos' || r.sector === sectorFilter
  );
  const alerts = rankData?.deteriorationAlerts || [];
  const recs = recData?.recommendations || [];
  const perf = recData?.performance || {};
  const strongCount = allRankings.filter((r) => (r.score ?? 0) >= 76).length;
  const avgScore = allRankings.length
    ? Math.round(allRankings.reduce((acc, r) => acc + (r.score || 0), 0) / allRankings.length)
    : null;

  return (
    <div>
      <div style={styles.headerRow}>
        <div>
          <span className="page-eyebrow">Análise Quantitativa · Critérios Auditáveis</span>
          <h1 style={styles.title}>
            <span style={{ color: 'var(--brand)', display: 'inline-flex' }}><ShieldCheckIcon size={22} /></span>
            Inteligência Quantitativa & Radar Diário
          </h1>
          <p style={styles.subtitle}>
            Classificação objetiva de empresas da B3 por valuation, rentabilidade, dividendos e alavancagem — com alertas de deterioração e histórico auditável.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {canRunEngine && (
            <button className="btn btn-emerald" onClick={runEngineNow} disabled={runningEngine}>
              <ShieldCheckIcon size={14} />
              {runningEngine ? 'Atualizando análises...' : 'Atualizar Análises'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={loadAll}>
            <RefreshIcon size={14} /> Recarregar
          </button>
        </div>
      </div>

      {/* Informative Disclaimer */}
      <div className="card" style={styles.disclaimerBox}>
        <strong>Nota metodológica:</strong> Os rankings e alertas são calculados de forma determinística a partir de indicadores públicos para fins de estudo. Não constituem recomendação personalizada de compra ou venda nem garantia de rentabilidade.
      </div>

      {/* Executive KPI Summary Strip */}
      {!loading && allRankings.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '0.85rem', marginBottom: '1.15rem' }}>
          <div className="card" style={{ padding: '0.95rem 1.1rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              Empresas Avaliadas
            </div>
            <div className="num" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
              {allRankings.length}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>Com fundamentos completos</div>
          </div>
          <div className="card" style={{ padding: '0.95rem 1.1rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              Oportunidades Fortes
            </div>
            <div className="num" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--positive)', marginTop: 4 }}>
              {strongCount}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>Pontuação ≥ 76 / 100</div>
          </div>
          <div className="card" style={{ padding: '0.95rem 1.1rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              Pontuação Média
            </div>
            <div className="num" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
              {avgScore != null ? `${avgScore}/100` : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>Média da carteira analisada</div>
          </div>
          <div className="card" style={{ padding: '0.95rem 1.1rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              Alertas de Deterioração
            </div>
            <div className="num" style={{ fontSize: '1.4rem', fontWeight: 800, color: alerts.length > 0 ? 'var(--negative)' : 'var(--positive)', marginTop: 4 }}>
              {alerts.length}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>Sinais de atenção financeira</div>
          </div>
        </div>
      )}

      {error && (
        <div className="error-banner" role="alert">
          <span>Não foi possível carregar as análises: {error}</span>
          <button className="btn btn-primary" onClick={loadAll}>Tentar novamente</button>
        </div>
      )}

      {/* Tabs with WCAG Tablist & Arrow Key Support */}
      <div
        className="tabs-bar"
        role="tablist"
        aria-label="Seções de Inteligência Quantitativa"
        onKeyDown={(e) => {
          const keys = ['oportunidades', 'alertas', 'bot'];
          const idx = keys.indexOf(tab);
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            setTab(keys[(idx + 1) % keys.length]);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setTab(keys[(idx - 1 + keys.length) % keys.length]);
          }
        }}
      >
        <button
          id="intel-tab-oportunidades"
          role="tab"
          aria-selected={tab === 'oportunidades'}
          aria-controls="intel-panel-oportunidades"
          tabIndex={tab === 'oportunidades' ? 0 : -1}
          className={`tab-btn ${tab === 'oportunidades' ? 'active' : ''}`}
          onClick={() => setTab('oportunidades')}
        >
          <BarChartIcon size={15} /> Ranking de Oportunidades ({rankData?.count || 0})
        </button>
        <button
          id="intel-tab-alertas"
          role="tab"
          aria-selected={tab === 'alertas'}
          aria-controls="intel-panel-alertas"
          tabIndex={tab === 'alertas' ? 0 : -1}
          className={`tab-btn ${tab === 'alertas' ? 'active' : ''}`}
          onClick={() => setTab('alertas')}
        >
          <TrendingDownIcon size={15} /> Alertas de Deterioração ({alerts.length})
        </button>
        <button
          id="intel-tab-bot"
          role="tab"
          aria-selected={tab === 'bot'}
          aria-controls="intel-panel-bot"
          tabIndex={tab === 'bot' ? 0 : -1}
          className={`tab-btn ${tab === 'bot' ? 'active' : ''}`}
          onClick={() => setTab('bot')}
        >
          <CheckCircleIcon size={15} /> Histórico do Bot & Desempenho ({recs.length})
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 110 }} />)}
        </div>
      ) : (
        <>
          {/* TAB 1: Transparent Quant Ranking */}
          {tab === 'oportunidades' && (
            <div id="intel-panel-oportunidades" role="tabpanel" aria-labelledby="intel-tab-oportunidades" className="tab-panel-animate">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Setor:</label>
                  <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)} className="field-input" style={{ width: 'auto' }}>
                    <option value="Todos">Todos os setores</option>
                    {(rankData?.sectors || []).map((sec) => <option key={sec} value={sec}>{sec}</option>)}
                  </select>
                </div>
                {rankData?.updatedAt && (
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-subtle)' }}>
                    Atualizado em {new Date(rankData.updatedAt).toLocaleString('pt-BR')}
                  </span>
                )}
              </div>

              {rankings.length === 0 ? (
                <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Nenhum ranking disponível no momento. {canRunEngine ? <>Clique em <strong>Atualizar Análises</strong> acima para processar os dados.</> : 'A atualização programada disponibilizará os dados em breve.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                  {rankings.map((item, idx) => (
                    <div key={item.symbol} className="card" style={{ padding: '1.2rem 1.35rem' }}>
                      <div style={styles.rankTop}>
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
                          onClick={() => navigate(`/acoes/${item.symbol}`)}
                        >
                          <span className={`rank-medal ${idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : 'rank-other'}`}>
                            {idx + 1}
                          </span>
                          <StockLogo src={item.logo} symbol={item.symbol} size={40} radius={9} />
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>{item.symbol}</strong>
                              <span className="pill pill-brand">{item.sector} · #{item.sectorRank} do setor</span>
                              <span className="pill pill-neutral" style={{ fontSize: '0.68rem' }}>{humanSource(item.source)}</span>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{item.name}</div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                          {item.price != null && (
                            <div style={{ textAlign: 'right' }}>
                              <div className="num" style={{ fontWeight: 800, fontSize: '1rem' }}>R$ {fmt(item.price)}</div>
                              {item.change != null && (
                                <div className="num" style={{ fontSize: '0.75rem', fontWeight: 700, color: item.change >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                                  {item.change >= 0 ? '+' : ''}{fmt(item.change, 2, '%')}
                                </div>
                              )}
                            </div>
                          )}
                          <div style={{ textAlign: 'right' }}>
                            <div className="num" style={{ fontSize: '1.35rem', fontWeight: 800, color: scoreColor(item.score) }}>
                              {item.score}<span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>/100</span>
                            </div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: scoreColor(item.score) }}>
                              {item.classification}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 5 Transparent Pillar Bars */}
                      <div style={styles.pillarsGrid}>
                        {[
                          { label: 'Valuation', val: item.breakdown.valuation, max: 25, color: '#0f766e' },
                          { label: 'Rentabilidade', val: item.breakdown.profitability, max: 25, color: '#10b981' },
                          { label: 'Dividendos', val: item.breakdown.dividend, max: 20, color: '#059669' },
                          { label: 'Saúde / Dívida', val: item.breakdown.debt, max: 15, color: '#f59e0b' },
                          { label: 'Crescimento', val: item.breakdown.growth, max: 15, color: '#475569' },
                        ].map((p) => (
                          <div key={p.label}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 3 }}>
                              <span>{p.label}</span>
                              <span className="num">{p.val}/{p.max}</span>
                            </div>
                            <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 999, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, (p.val / p.max) * 100)}%`, height: '100%', background: p.color, borderRadius: 999 }} />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Data-grounded Explanation */}
                      <p style={styles.explanation}>{item.explanation}</p>

                      {/* Positives / Risks / Actions */}
                      <div style={styles.bottomRow}>
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', flex: 1 }}>
                          {item.positives.slice(0, 3).map((pos, i) => (
                            <span key={`p-${i}`} className="pill pill-pos" style={{ fontSize: '0.71rem' }}>+ {pos}</span>
                          ))}
                          {item.risks.slice(0, 2).map((rk, i) => (
                            <span key={`r-${i}`} className="pill pill-neg" style={{ fontSize: '0.71rem' }}>! {rk}</span>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: '0.45rem' }}>
                          <button className="btn btn-ghost" style={{ padding: '0.35rem 0.7rem', fontSize: '0.76rem' }} onClick={() => navigate(`/acoes/${item.symbol}`)}>
                            Detalhes
                          </button>
                          <button className="btn btn-primary" style={{ padding: '0.35rem 0.7rem', fontSize: '0.76rem' }} onClick={() => navigate(`/comparar?tickers=${item.symbol}`)}>
                            <ScaleIcon size={13} /> Comparar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Deterioration Alerts */}
          {tab === 'alertas' && (
            <div id="intel-panel-alertas" role="tabpanel" aria-labelledby="intel-tab-alertas" className="tab-panel-animate">
              {alerts.length === 0 ? (
                <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Nenhum alerta crítico de deterioração detectado no conjunto atual.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                  {alerts.map((a) => (
                    <div
                      key={a.symbol}
                      className="card card-interactive"
                      style={{ padding: '1.2rem' }}
                      onClick={() => navigate(`/acoes/${a.symbol}`)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <StockLogo src={a.logo} symbol={a.symbol} size={34} radius={8} />
                          <div>
                            <strong>{a.symbol}</strong>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{a.sector}</div>
                          </div>
                        </div>
                        <span className="pill pill-neg num">Score {a.score}/100</span>
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--negative)', fontSize: '0.83rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {a.deteriorationFlags.map((flag, idx) => (
                          <li key={idx}>{flag}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Daily Bot Recommendations & Performance Evaluation */}
          {tab === 'bot' && (
            <div id="intel-panel-bot" role="tabpanel" aria-labelledby="intel-tab-bot" className="tab-panel-animate">
              <div style={styles.statsGrid}>
                <div className="card" style={styles.statCard}>
                  <span style={styles.statLabel}>Sugestões Registradas</span>
                  <strong className="num" style={styles.statVal}>{recs.length}</strong>
                </div>
                <div className="card" style={styles.statCard}>
                  <span style={styles.statLabel}>Retorno Médio Avaliado</span>
                  <strong
                    className="num"
                    style={{
                      ...styles.statVal,
                      color: perf.avgReturnPct == null ? 'var(--text-primary)' : perf.avgReturnPct >= 0 ? 'var(--positive)' : 'var(--negative)',
                    }}
                  >
                    {perf.avgReturnPct != null ? `${perf.avgReturnPct >= 0 ? '+' : ''}${fmt(perf.avgReturnPct, 2, '%')}` : '—'}
                  </strong>
                </div>
                <div className="card" style={styles.statCard}>
                  <span style={styles.statLabel}>Taxa Positiva</span>
                  <strong className="num" style={{ ...styles.statVal, color: 'var(--brand)' }}>
                    {perf.hitRatePct != null ? `${fmt(perf.hitRatePct, 1, '%')}` : '—'}
                  </strong>
                </div>
              </div>

              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '0.9rem 1.15rem', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Acompanhamento automático do desempenho após cada relatório diário — com opção de envio pelo Telegram.
                </div>
                {recs.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Nenhuma execução registrada do bot ainda.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ minWidth: 780 }}>
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Ativo</th>
                          <th style={{ textAlign: 'right' }}>Score</th>
                          <th style={{ textAlign: 'right' }}>Preço na Data</th>
                          <th style={{ textAlign: 'right' }}>Preço Atual</th>
                          <th style={{ textAlign: 'right' }}>Desempenho</th>
                          <th>Resumo / Riscos</th>
                          <th style={{ textAlign: 'center' }}>Telegram</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recs.map((rec) => {
                          const ret = rec.returnPct;
                          return (
                            <tr key={rec.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/acoes/${rec.symbol}`)}>
                              <td className="mono" style={{ fontSize: '0.78rem' }}>{rec.runDate}</td>
                              <td><strong className="mono">{rec.symbol}</strong></td>
                              <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: scoreColor(rec.score) }}>{rec.score}</td>
                              <td className="num" style={{ textAlign: 'right' }}>R$ {fmt(rec.priceAtRec)}</td>
                              <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>R$ {fmt(rec.currentPrice)}</td>
                              <td
                                className="num"
                                style={{
                                  textAlign: 'right',
                                  fontWeight: 800,
                                  color: ret == null ? 'var(--text-subtle)' : ret >= 0 ? 'var(--positive)' : 'var(--negative)',
                                }}
                              >
                                {ret != null ? `${ret >= 0 ? '+' : ''}${fmt(ret, 2, '%')}` : '—'}
                              </td>
                              <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: 280 }}>
                                {rec.summary}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={`pill ${rec.deliveredTelegram ? 'pill-pos' : 'pill-neutral'}`} style={{ fontSize: '0.68rem' }}>
                                  {rec.deliveredTelegram ? 'Enviado' : 'Local'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.9rem' },
  title: { margin: '0 0 0.25rem 0', fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' },
  subtitle: { margin: 0, fontSize: '0.86rem', color: 'var(--text-muted)' },
  disclaimerBox: {
    padding: '0.75rem 1.05rem',
    marginBottom: '1.1rem',
    fontSize: '0.79rem',
    color: 'var(--text-secondary)',
    borderLeft: '3.5px solid var(--brand)',
    background: 'var(--bg-surface-subtle)',
  },
  rankTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.9rem' },
  pillarsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '0.75rem', marginBottom: '0.85rem' },
  explanation: { margin: '0 0 0.85rem 0', fontSize: '0.84rem', lineHeight: 1.55, color: 'var(--text-secondary)' },
  bottomRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.9rem', marginBottom: '1.25rem' },
  statCard: { padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  statLabel: { fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' },
  statVal: { fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' },
};

export default Intelligence;

