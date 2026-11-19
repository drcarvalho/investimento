import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChartIcon, BookOpenIcon, ScaleIcon, InfoIcon, TrendingUpIcon } from '../components/Icons';
import StockLogo from '../components/StockLogo';
import { apiFetch } from '../api';

function fmt(v, dec = 2, suffix = '') {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return `${Number(v).toFixed(dec).replace('.', ',')}${suffix}`;
}

function scoreColor(score) {
  if (score >= 76) return '#10b981';
  if (score >= 62) return '#0284c7';
  if (score >= 45) return '#f59e0b';
  return '#f43f5e';
}

function classLabel(score) {
  if (score >= 76) return 'Oportunidade';
  if (score >= 62) return 'Equilibrada';
  if (score >= 45) return 'Atenção';
  return 'Alto Risco';
}

/* Tooltip educativo — aprende sobre cada indicador */
const METRIC_TIPS = {
  pl: {
    label: 'P/L',
    desc: 'Preço / Lucro — quantos anos de lucro pagam o preço da ação. Quanto menor (> 0), mais barata.',
    good: (v) => v > 0 && v <= 12,
  },
  pvp: {
    label: 'P/VP',
    desc: 'Preço / Valor Patrimonial — compara o preço de mercado com o patrimônio contábil. Abaixo de 1 pode indicar desconto.',
    good: (v) => v > 0 && v <= 1.5,
  },
  dy: {
    label: 'DY',
    desc: 'Dividend Yield — percentual de dividendos pagos nos últimos 12 meses. Acima de 6% é considerado atrativo.',
    good: (v) => v >= 6,
  },
  roe: {
    label: 'ROE',
    desc: 'Retorno sobre Patrimônio — eficiência da empresa em gerar lucro com capital próprio. Acima de 15% é excelente.',
    good: (v) => v >= 15,
  },
  divLiqEbitda: {
    label: 'Dív/EBITDA',
    desc: 'Dívida Líquida / EBITDA — anos de geração operacional para pagar a dívida. Abaixo de 2,5x é saudável.',
    good: (v) => v != null && v <= 2.5,
  },
};

function MetricPill({ tipKey, value, suffix = '' }) {
  const tip = METRIC_TIPS[tipKey];
  if (!tip || value == null || isNaN(value)) return null;
  const isGood = tip.good(value);
  return (
    <span
      className={`pill ${isGood ? 'pill-pos' : 'pill-neutral'}`}
      title={tip.desc}
      style={{ cursor: 'help', fontSize: '0.74rem' }}
    >
      {tip.label}: {fmt(value, tipKey === 'dy' || tipKey === 'roe' ? 1 : 2)}{suffix}
    </span>
  );
}

function Recomendacoes() {
  const navigate = useNavigate();
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [expanded, setExpanded] = React.useState(null);
  const [expandedProj, setExpandedProj] = React.useState(null);

  React.useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch('/api/intelligence/top-picks')
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const picks = data?.picks || [];

  return (
    <div>
      {/* Header */}
      <div style={styles.headerRow}>
        <div>
          <span className="page-eyebrow">Seleção Quantitativa · Top 10</span>
          <h1 style={styles.title}>Destaques de Estudo</h1>
          <p style={styles.subtitle}>
            As 10 empresas mais bem pontuadas pelo modelo fundamentalista, com justificativa dos pilares e cenários para 3M, 6M e 1A.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.65rem' }}>
          <button className="btn btn-primary" onClick={() => navigate('/projecoes')}>
            <TrendingUpIcon size={14} /> Ver Painel Completo de Projeções (3M / 6M / 1A)
          </button>
        </div>
      </div>

      {/* Disclaimer educativo */}
      <div className="card" style={styles.disclaimerBox}>
        <strong>⚠️ Finalidade educativa:</strong> Esta lista é gerada por critérios quantitativos públicos para fins de <strong>aprendizado</strong>.
        Não constitui recomendação de compra ou venda. Antes de investir, estude por conta própria e consulte um profissional certificado (CEA/CGA).
      </div>

      {/* Guia rápido de indicadores */}
      <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.15rem' }}>
        <h2 className="section-title" style={{ fontSize: '0.92rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <BookOpenIcon size={16} /> Como ler os indicadores
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.65rem' }}>
          {Object.values(METRIC_TIPS).map((tip) => (
            <div key={tip.label} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{tip.label}:</strong> {tip.desc}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>Não foi possível carregar as recomendações: {error}</span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}
        </div>
      ) : picks.length === 0 ? (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Nenhum ativo disponível no momento. Os dados serão carregados quando o motor quantitativo completar a primeira análise.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {picks.map((item, idx) => (
            <div key={item.symbol} className="card" style={{ padding: '1.25rem 1.4rem', transition: 'box-shadow 0.2s' }}>
              {/* Top Row: Rank + Info + Score */}
              <div style={styles.cardTop}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
                  onClick={() => navigate(`/acoes/${item.symbol}`)}
                >
                  <span className={`rank-medal ${idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : 'rank-other'}`}>
                    {idx + 1}
                  </span>
                  <StockLogo src={item.logo} symbol={item.symbol} size={44} radius={10} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>{item.symbol}</strong>
                      <span className="pill pill-brand" style={{ fontSize: '0.7rem' }}>{item.sector}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.name}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', flexWrap: 'wrap' }}>
                  {item.price != null && (
                    <div style={{ textAlign: 'right' }}>
                      <div className="num" style={{ fontWeight: 800, fontSize: '1.05rem' }}>R$ {fmt(item.price)}</div>
                      {item.change != null && (
                        <div className="num" style={{ fontSize: '0.76rem', fontWeight: 700, color: item.change >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                          {item.change >= 0 ? '+' : ''}{fmt(item.change, 2, '%')}
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ textAlign: 'right' }}>
                    <div className="num" style={{ fontSize: '1.4rem', fontWeight: 800, color: scoreColor(item.score) }}>
                      {item.score}<span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>/100</span>
                    </div>
                    <div style={{ fontSize: '0.73rem', fontWeight: 700, color: scoreColor(item.score) }}>
                      {classLabel(item.score)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Metrics Pills — educativo */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <MetricPill tipKey="pl" value={item.metrics?.pl} />
                <MetricPill tipKey="pvp" value={item.metrics?.pvp} />
                <MetricPill tipKey="dy" value={item.metrics?.dy} suffix="%" />
                <MetricPill tipKey="roe" value={item.metrics?.roe} suffix="%" />
                <MetricPill tipKey="divLiqEbitda" value={item.metrics?.dividaLiquidaEbitda} suffix="x" />
              </div>

              {/* Pontos fortes / riscos — sempre visíveis */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.65rem' }}>
                {(item.positives || []).slice(0, 3).map((pos, i) => (
                  <span key={`p-${i}`} className="pill pill-pos" style={{ fontSize: '0.72rem' }}>✓ {pos}</span>
                ))}
                {(item.risks || []).slice(0, 2).map((rk, i) => (
                  <span key={`r-${i}`} className="pill pill-neg" style={{ fontSize: '0.72rem' }}>⚠ {rk}</span>
                ))}
              </div>

              {/* Expandir para explicação educativa / projeções */}
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.7rem' }}>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
                    onClick={() => setExpanded(expanded === item.symbol ? null : item.symbol)}
                  >
                    <BookOpenIcon size={13} /> {expanded === item.symbol ? 'Fechar explicação' : 'Por que se destaca? (aprender)'}
                  </button>
                  {item.projections && (
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', color: 'var(--brand)' }}
                      onClick={() => setExpandedProj(expandedProj === item.symbol ? null : item.symbol)}
                    >
                      <TrendingUpIcon size={13} /> {expandedProj === item.symbol ? 'Ocultar projeções' : 'Projeções 3M / 6M / 1A'}
                    </button>
                  )}
                </div>

                {expanded === item.symbol && (
                  <div style={styles.learnBox}>
                    <p style={{ margin: '0 0 0.65rem', fontSize: '0.84rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                      {item.explanation}
                    </p>

                    <h4 style={{ margin: '0 0 0.4rem', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                      🎯 O que aprender com este ativo:
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {(item.learningPoints || []).map((point, i) => (
                        <li key={i}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {expandedProj === item.symbol && item.projections && (
                  <div style={{ marginTop: '0.65rem', padding: '0.85rem 1rem', background: 'var(--bg-surface-subtle)', borderRadius: 8, borderLeft: '3px solid var(--positive)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.55rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                        📈 Cenários Estimados de Subidas / Descidas:
                      </strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
                        Modelos Graham + Bazin + ROE + Risco
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '0.6rem', marginBottom: '0.6rem' }}>
                      {item.projections.scenarios.map((s) => (
                        <div key={s.horizon} style={{ padding: '0.6rem 0.75rem', background: 'var(--bg-surface)', borderRadius: 6 }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                            {s.horizon}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.2rem', textAlign: 'center', fontSize: '0.68rem' }}>
                            <div>
                              <span style={{ color: '#f43f5e', fontWeight: 700 }}>Pessimista</span>
                              <div className="num" style={{ color: '#f43f5e', fontWeight: 800 }}>{s.bear.returnPct >= 0 ? '+' : ''}{fmt(s.bear.returnPct, 1)}%</div>
                              <div className="num" style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>R$ {fmt(s.bear.price)}</div>
                            </div>
                            <div>
                              <span style={{ color: '#0f766e', fontWeight: 700 }}>Base</span>
                              <div className="num" style={{ color: '#0f766e', fontWeight: 800 }}>{s.base.returnPct >= 0 ? '+' : ''}{fmt(s.base.returnPct, 1)}%</div>
                              <div className="num" style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>R$ {fmt(s.base.price)}</div>
                            </div>
                            <div>
                              <span style={{ color: '#10b981', fontWeight: 700 }}>Otimista</span>
                              <div className="num" style={{ color: '#10b981', fontWeight: 800 }}>{s.bull.returnPct >= 0 ? '+' : ''}{fmt(s.bull.returnPct, 1)}%</div>
                              <div className="num" style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>R$ {fmt(s.bull.price)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {item.projections.fairValue && (
                      <div style={{ display: 'flex', gap: '0.8rem', fontSize: '0.74rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                        {item.projections.fairValue.graham && (
                          <span>Graham: <strong>R$ {fmt(item.projections.fairValue.graham)}</strong></span>
                        )}
                        {item.projections.fairValue.bazin && (
                          <span>Bazin (Teto): <strong>R$ {fmt(item.projections.fairValue.bazin)}</strong></span>
                        )}
                        <span>Potencial Justo Médio: <strong style={{ color: item.projections.fairValue.avgUpside >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{item.projections.fairValue.avgUpside >= 0 ? '+' : ''}{fmt(item.projections.fairValue.avgUpside, 1)}%</strong></span>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                  <button
                    className="btn btn-primary"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                    onClick={() => navigate(`/acoes/${item.symbol}`)}
                  >
                    <BarChartIcon size={13} /> Ver análise completa
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                    onClick={() => navigate(`/comparar?tickers=${item.symbol}`)}
                  >
                    <ScaleIcon size={13} /> Comparar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rodapé educativo */}
      {!loading && picks.length > 0 && (
        <div className="card" style={{ padding: '1.1rem 1.3rem', marginTop: '1.25rem' }}>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <InfoIcon size={15} /> Próximos passos para aprender
          </h3>
          <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.84rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <li><strong>Clique em um ativo</strong> e estude seus gráficos históricos, fundamentos completos e preço justo (Graham e Bazin).</li>
            <li><strong>Compare ativos do mesmo setor</strong> usando o botão "Comparar" para entender diferenças de valuation.</li>
            <li><strong>Consulte a aba "Estudos"</strong> para revisar a metodologia e fórmulas utilizadas no cálculo de cada indicador.</li>
            <li><strong>Acompanhe ao longo do tempo</strong> — adicione ativos à sua Carteira e observe como os fundamentos evoluem.</li>
            <li><strong>Nunca invista sem entender</strong> — se um indicador é desconhecido, passe o mouse sobre as pills coloridas acima para aprender.</li>
          </ol>
        </div>
      )}
    </div>
  );
}

const styles = {
  headerRow: { marginBottom: '0.9rem' },
  title: { margin: '0 0 0.3rem 0', fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' },
  subtitle: { margin: 0, fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.55 },
  disclaimerBox: {
    padding: '0.8rem 1.1rem',
    marginBottom: '1.1rem',
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    borderLeft: '3.5px solid var(--warning, #f59e0b)',
    background: 'var(--bg-surface-subtle)',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.85rem' },
  learnBox: {
    marginTop: '0.65rem',
    padding: '0.9rem 1rem',
    background: 'var(--bg-surface-subtle)',
    borderRadius: '8px',
    borderLeft: '3px solid var(--brand)',
  },
};

export default Recomendacoes;
