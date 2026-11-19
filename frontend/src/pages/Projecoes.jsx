import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChartIcon, BookOpenIcon, InfoIcon } from '../components/Icons';
import StockLogo from '../components/StockLogo';
import { apiFetch } from '../api';

function fmt(v, dec = 2) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return Number(v).toFixed(dec).replace('.', ',');
}

function pctColor(v) {
  if (v == null) return 'var(--text-muted)';
  return v >= 0 ? 'var(--positive)' : 'var(--negative)';
}

function ScenarioBar({ bear, base, bull, label }) {
  // Visual bar showing range from bear to bull with base as center marker
  const minVal = Math.min(bear, -15);
  const maxVal = Math.max(bull, 15);
  const range = maxVal - minVal || 1;

  const bearPos = ((bear - minVal) / range) * 100;
  const basePos = ((base - minVal) / range) * 100;
  const bullPos = ((bull - minVal) / range) * 100;
  const zeroPos = ((0 - minVal) / range) * 100;

  return (
    <div style={{ marginBottom: '0.4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 3 }}>
        <span>{label}</span>
        <span className="num">{bear >= 0 ? '+' : ''}{fmt(bear, 1)}%  →  {bull >= 0 ? '+' : ''}{fmt(bull, 1)}%</span>
      </div>
      <div style={{ position: 'relative', height: 20, background: 'var(--border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
        {/* Zero line */}
        <div style={{
          position: 'absolute', left: `${zeroPos}%`, top: 0, bottom: 0, width: 1,
          background: 'var(--text-subtle)', opacity: 0.4, zIndex: 2,
        }} />
        {/* Bear-to-Bull gradient bar */}
        <div style={{
          position: 'absolute',
          left: `${Math.min(bearPos, bullPos)}%`,
          width: `${Math.abs(bullPos - bearPos)}%`,
          top: 2, bottom: 2,
          borderRadius: 8,
          background: 'linear-gradient(90deg, #f43f5e 0%, #f59e0b 40%, #10b981 100%)',
          opacity: 0.75,
        }} />
        {/* Base marker */}
        <div style={{
          position: 'absolute', left: `calc(${basePos}% - 5px)`, top: 2, bottom: 2,
          width: 10, borderRadius: 5,
          background: '#0f766e', border: '2px solid var(--bg-surface)',
          zIndex: 3,
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginTop: 2 }}>
        <span style={{ color: '#f43f5e' }}>Pessimista</span>
        <span style={{ color: '#0f766e', fontWeight: 700 }}>Base: {base >= 0 ? '+' : ''}{fmt(base, 1)}%</span>
        <span style={{ color: '#10b981' }}>Otimista</span>
      </div>
    </div>
  );
}

function Projecoes() {
  const navigate = useNavigate();
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [expanded, setExpanded] = React.useState(null);
  const [showMethodology, setShowMethodology] = React.useState(false);

  React.useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch('/api/intelligence/projections')
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const assets = data?.assets || [];

  return (
    <div>
      {/* Header */}
      <div style={styles.headerRow}>
        <div>
          <span className="page-eyebrow">Modelos Fundamentalistas · 3M / 6M / 1A</span>
          <h1 style={styles.title}>Projeções de Preço</h1>
          <p style={styles.subtitle}>
            Cenários otimista, base e pessimista estimados a partir de Graham, Bazin, crescimento orgânico (ROE) e risco de alavancagem.
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="card" style={styles.disclaimerBox}>
        <strong>⚠️ Importante:</strong> Estas projeções são <strong>estimativas educativas</strong> baseadas exclusivamente em indicadores fundamentalistas públicos.
        O mercado real é influenciado por fatores macroeconômicos, políticos e comportamentais que nenhum modelo captura completamente.
        <strong> Nunca tome decisões de investimento baseado apenas em projeções quantitativas.</strong>
      </div>

      {/* Methodology toggle */}
      <div className="card" style={{ padding: '0.9rem 1.2rem', marginBottom: '1.1rem' }}>
        <button
          className="btn btn-ghost"
          style={{ fontSize: '0.82rem', padding: '0.3rem 0.6rem', marginBottom: showMethodology ? '0.7rem' : 0 }}
          onClick={() => setShowMethodology(!showMethodology)}
        >
          <BookOpenIcon size={14} /> {showMethodology ? 'Ocultar metodologia' : 'Como são calculadas as projeções? (clique para aprender)'}
        </button>

        {showMethodology && (
          <div style={{ padding: '0.8rem 1rem', background: 'var(--bg-surface-subtle)', borderRadius: 8, borderLeft: '3px solid var(--brand)' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Metodologia das Projeções</h3>
            <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {(data?.methodologyOverview || []).map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ol>
            <div style={{ marginTop: '0.7rem', padding: '0.6rem 0.8rem', background: 'var(--bg-surface)', borderRadius: 6, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <strong>Fórmulas:</strong><br />
              • Graham: VI = √(22,5 × LPA × VPA) — onde LPA = Preço ÷ P/L e VPA = Preço ÷ P/VP<br />
              • Bazin: Preço Teto = (DY% × Preço ÷ 100) ÷ 0,06<br />
              • Crescimento: ROE × (1 − payout ratio), composto no período<br />
              • Risco: desconto de 5–15% a.a. por endividamento elevado (Dív/EBITDA {'>'} 2,5x)
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>Não foi possível carregar as projeções: {error}</span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ height: 180 }} />)}
        </div>
      ) : assets.length === 0 ? (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Nenhum ativo disponível para projeção no momento.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {assets.map((item, idx) => {
            const proj = item.projections;
            if (!proj) return null;

            return (
              <div key={item.symbol} className="card" style={{ padding: '1.3rem 1.5rem' }}>
                {/* Asset header */}
                <div style={styles.cardTop}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
                    onClick={() => navigate(`/acoes/${item.symbol}`)}
                  >
                    <span className={`rank-medal ${idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : 'rank-other'}`}>
                      {idx + 1}
                    </span>
                    <StockLogo src={item.logo} symbol={item.symbol} size={42} radius={10} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '1.08rem', color: 'var(--text-primary)' }}>{item.symbol}</strong>
                        <span className="pill pill-brand" style={{ fontSize: '0.68rem' }}>{item.sector}</span>
                        <span className="pill pill-neutral num" style={{ fontSize: '0.68rem' }}>Score {item.score}/100</span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{item.name}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Preço Atual</div>
                    <div className="num" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      R$ {fmt(proj.currentPrice)}
                    </div>
                  </div>
                </div>

                {/* Fair value indicators */}
                <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
                  {proj.fairValue.graham && (
                    <div className="card" style={{ padding: '0.6rem 0.85rem', flex: '1 1 180px', background: 'var(--bg-surface-subtle)' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Graham</div>
                      <div className="num" style={{ fontSize: '1.1rem', fontWeight: 800, color: proj.fairValue.graham > proj.currentPrice ? 'var(--positive)' : 'var(--negative)' }}>
                        R$ {fmt(proj.fairValue.graham)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
                        {proj.fairValue.graham > proj.currentPrice
                          ? `${fmt(((proj.fairValue.graham - proj.currentPrice) / proj.currentPrice) * 100, 1)}% de margem`
                          : `${fmt(((proj.currentPrice - proj.fairValue.graham) / proj.currentPrice) * 100, 1)}% acima do justo`}
                      </div>
                    </div>
                  )}
                  {proj.fairValue.bazin && (
                    <div className="card" style={{ padding: '0.6rem 0.85rem', flex: '1 1 180px', background: 'var(--bg-surface-subtle)' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Bazin (Teto)</div>
                      <div className="num" style={{ fontSize: '1.1rem', fontWeight: 800, color: proj.fairValue.bazin > proj.currentPrice ? 'var(--positive)' : 'var(--negative)' }}>
                        R$ {fmt(proj.fairValue.bazin)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
                        {proj.fairValue.bazin > proj.currentPrice
                          ? `Preço abaixo do teto de renda`
                          : `Acima do teto para DY 6%`}
                      </div>
                    </div>
                  )}
                  <div className="card" style={{ padding: '0.6rem 0.85rem', flex: '1 1 180px', background: 'var(--bg-surface-subtle)' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Potencial Justo</div>
                    <div className="num" style={{ fontSize: '1.1rem', fontWeight: 800, color: pctColor(proj.fairValue.avgUpside) }}>
                      {proj.fairValue.avgUpside >= 0 ? '+' : ''}{fmt(proj.fairValue.avgUpside, 1)}%
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>Média Graham + Bazin</div>
                  </div>
                </div>

                {/* Scenario bars for each horizon */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem', marginBottom: '0.8rem' }}>
                  {proj.scenarios.map((s) => (
                    <div key={s.horizon} style={{ padding: '0.7rem 0.9rem', background: 'var(--bg-surface-subtle)', borderRadius: 8 }}>
                      <ScenarioBar
                        bear={s.bear.returnPct}
                        base={s.base.returnPct}
                        bull={s.bull.returnPct}
                        label={s.horizon}
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.3rem', marginTop: '0.45rem' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '0.62rem', color: '#f43f5e', fontWeight: 700, textTransform: 'uppercase' }}>Pess.</div>
                          <div className="num" style={{ fontSize: '0.82rem', fontWeight: 800, color: '#f43f5e' }}>R$ {fmt(s.bear.price)}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '0.62rem', color: '#0f766e', fontWeight: 700, textTransform: 'uppercase' }}>Base</div>
                          <div className="num" style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f766e' }}>R$ {fmt(s.base.price)}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '0.62rem', color: '#10b981', fontWeight: 700, textTransform: 'uppercase' }}>Otim.</div>
                          <div className="num" style={{ fontSize: '0.82rem', fontWeight: 800, color: '#10b981' }}>R$ {fmt(s.bull.price)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Methodology transparency for this asset */}
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '0.76rem', padding: '0.25rem 0.55rem' }}
                  onClick={() => setExpanded(expanded === item.symbol ? null : item.symbol)}
                >
                  <InfoIcon size={12} /> {expanded === item.symbol ? 'Fechar cálculos' : 'Ver cálculos utilizados'}
                </button>

                {expanded === item.symbol && (
                  <div style={{ marginTop: '0.5rem', padding: '0.7rem 0.9rem', background: 'var(--bg-surface-subtle)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Critérios aplicados a {item.symbol}:</strong>
                    <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {(proj.methodology || []).map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.6rem' }}>
                  <button className="btn btn-primary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.76rem' }} onClick={() => navigate(`/acoes/${item.symbol}`)}>
                    <BarChartIcon size={13} /> Análise completa
                  </button>
                  <button className="btn btn-ghost" style={{ padding: '0.3rem 0.7rem', fontSize: '0.76rem' }} onClick={() => navigate(`/comparar?tickers=${item.symbol}`)}>
                    Comparar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer disclaimer */}
      {!loading && assets.length > 0 && (
        <div className="card" style={{ padding: '1rem 1.2rem', marginTop: '1.2rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <strong>📖 Como interpretar as projeções:</strong>
          <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem' }}>
            <li><span style={{ color: '#10b981' }}>Cenário otimista</span>: supõe que o preço converge ao valor justo (Graham/Bazin), com crescimento forte e dividendos reinvestidos.</li>
            <li><span style={{ color: '#0f766e' }}>Cenário base</span>: convergência parcial ao valor justo, apenas crescimento orgânico e dividendos normais.</li>
            <li><span style={{ color: '#f43f5e' }}>Cenário pessimista</span>: sem recuperação de valor, com impacto de risco de endividamento e ambiente macroeconômico adverso.</li>
            <li>As projeções <strong>não</strong> consideram eventos extraordinários (M&A, regulação, crises globais, mudanças na Selic).</li>
          </ul>
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
    borderLeft: '3.5px solid #f43f5e',
    background: 'var(--bg-surface-subtle)',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.9rem' },
};

export default Projecoes;
