import React from 'react';
import { useNavigate } from 'react-router-dom';
import MarketHeatmap from '../components/MarketHeatmap';
import PriceChart from '../components/PriceChart';
import CurrencyConverter from '../components/CurrencyConverter';
import SectorPerformance from '../components/SectorPerformance';
import ViabilityBadge from '../components/ViabilityBadge';
import StockLogo from '../components/StockLogo';
import {
  RefreshIcon,
  ScaleIcon,
  StarIcon,
  ShieldCheckIcon,
  BarChartIcon,
} from '../components/Icons';
import { useWatchlist } from '../hooks/useWatchlist';
import { useRecentStocks } from '../hooks/useRecentStocks';
import { apiFetch } from '../api';
import { fmtNum, fmtVol, fmtMacroVal } from '../utils/format';

const MARKET_TABS = [
  { key: 'acoes', label: 'Ações B3' },
  { key: 'fiis', label: 'FIIs' },
  { key: 'etfs', label: 'ETFs' },
  { key: 'setores', label: 'Setores B3' },
  { key: 'mapa', label: 'Mapa de Calor' },
];

const MOVER_TABS = [
  { key: 'altas', label: 'Altas' },
  { key: 'baixas', label: 'Baixas' },
  { key: 'volume', label: 'Vol' },
  { key: 'dy', label: 'DY' },
];

const QUICK_FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'dy', label: 'DY ≥ 6%' },
  { key: 'pl', label: 'P/L ≤ 12' },
  { key: 'roe', label: 'ROE ≥ 15%' },
  { key: 'azulim', label: 'Atrativas' },
];

const SPOTLIGHT_DEFAULT_TICKERS = ['PETR4', 'VALE3', 'ITUB4', 'MGLU3'];

function getStockSortVal(s, key) {
  switch (key) {
    case 'symbol':
      return s.symbol || '';
    case 'price':
      return s.price ?? -Infinity;
    case 'change':
      return s.change ?? -Infinity;
    case 'pl':
      return s.valuation?.pl > 0 ? s.valuation.pl : Infinity;
    case 'pvp':
      return s.valuation?.pvp ?? Infinity;
    case 'dy':
      return s.valuation?.dividendYield ?? -Infinity;
    case 'roe':
      return s.rentabilidade?.roe ?? -Infinity;
    case 'graham':
      return s.fairValue?.grahamUpside ?? -Infinity;
    case 'score':
      return s.viability?.score ?? -Infinity;
    default:
      return s.marketCap ?? -Infinity;
  }
}

function Home() {
  const navigate = useNavigate();
  const { watchlist, isStarred, toggle } = useWatchlist();
  const recentStocks = useRecentStocks();

  const [market, setMarket] = React.useState(null);
  const [macro, setMacro] = React.useState([]);
  const [rankings, setRankings] = React.useState(null);
  const [allStocks, setAllStocks] = React.useState([]);
  const [fiis, setFiis] = React.useState([]);
  const [etfs, setEtfs] = React.useState([]);
  const [quantTop, setQuantTop] = React.useState([]);

  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [fiisLoaded, setFiisLoaded] = React.useState(false);
  const [etfsLoaded, setEtfsLoaded] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [lastUpdate, setLastUpdate] = React.useState(null);

  const [spotlightSymbol, setSpotlightSymbol] = React.useState('PETR4');
  const [marketTab, setMarketTab] = React.useState('acoes');
  const [moverTab, setMoverTab] = React.useState('altas');
  const [stockFilter, setStockFilter] = React.useState('all');
  const [sortCol, setSortCol] = React.useState('default');
  const [sortDir, setSortDir] = React.useState('desc');


  const fetchAll = React.useCallback((manual = false) => {
    if (manual) setRefreshing(true);
    setError(null);

    Promise.all([
      apiFetch('/api/market'),
      apiFetch('/api/rankings'),
      apiFetch('/api/indicators').catch(() => ({ stocks: [] })),
      apiFetch('/api/macro').catch(() => ({ indicators: [] })),
      apiFetch('/api/intelligence/rankings').catch(() => ({ rankings: [] })),
    ])
      .then(([marketData, rankingsData, indData, macroData, quantData]) => {
        setMarket(marketData);
        setRankings(rankingsData);
        setAllStocks(indData?.stocks || []);
        setMacro(macroData?.indicators || []);
        setQuantTop((quantData?.rankings || []).slice(0, 4));
        setLastUpdate(new Date().toLocaleTimeString('pt-BR'));
        setLoading(false);
        setRefreshing(false);
      })
      .catch((err) => {
        console.error('Erro ao carregar portal:', err);
        setError('Não foi possível atualizar os dados do mercado agora. Tente novamente em instantes.');
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  React.useEffect(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll(false), 60000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Lazy load FIIs / ETFs only when user selects those tabs
  React.useEffect(() => {
    if (marketTab === 'fiis' && !fiisLoaded) {
      apiFetch('/api/assets?type=fii')
        .then((res) => setFiis((res.assets || []).slice(0, 15)))
        .catch(() => {})
        .finally(() => setFiisLoaded(true));
    } else if (marketTab === 'etfs' && !etfsLoaded) {
      apiFetch('/api/assets?type=etf')
        .then((res) => setEtfs((res.assets || []).slice(0, 15)))
        .catch(() => {})
        .finally(() => setEtfsLoaded(true));
    }
  }, [marketTab, fiisLoaded, etfsLoaded]);

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortCol(col);
      setSortDir(col === 'pl' || col === 'pvp' || col === 'symbol' ? 'asc' : 'desc');
    }
  };

  const sortArrow = (col) => (sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '');

  const totalStocks = market?.summary?.totalStocks || 1;
  const upPct = market ? Math.round((market.summary.stocksUp / totalStocks) * 100) : 50;
  const downPct = market ? Math.round((market.summary.stocksDown / totalStocks) * 100) : 50;
  const sentiment =
    upPct >= 58 ? { label: 'Comprador', cls: 'pill-pos' } : downPct >= 58 ? { label: 'Vendedor', cls: 'pill-neg' } : { label: 'Neutro', cls: 'pill-neutral' };

  const macroMap = Object.fromEntries(macro.map((m) => [m.key, m]));
  const orderedMacro = [
    macroMap.ptax_usd,
    macroMap.selic,
    macroMap.ipca_12m,
    macroMap.ipca_mensal,
  ].filter(Boolean);

  // Stock lookup map for Spotlight header & DY leaderboard
  const stockBySymbol = React.useMemo(
    () => Object.fromEntries(allStocks.map((s) => [s.symbol, s])),
    [allStocks]
  );

  const spotlightMeta =
    stockBySymbol[spotlightSymbol] ||
    (market?.heatmap || []).find((h) => h.symbol === spotlightSymbol) ||
    null;

  const spotlightTickers = SPOTLIGHT_DEFAULT_TICKERS.includes(spotlightSymbol)
    ? SPOTLIGHT_DEFAULT_TICKERS
    : [spotlightSymbol, ...SPOTLIGHT_DEFAULT_TICKERS.slice(0, 3)];

  // Filtered + sorted stocks for Oceans14/UOL main table
  const visibleStocks = React.useMemo(() => {
    let list = [...allStocks];
    if (stockFilter === 'dy') list = list.filter((s) => (s.valuation?.dividendYield ?? 0) >= 6);
    else if (stockFilter === 'pl') list = list.filter((s) => s.valuation?.pl > 0 && s.valuation.pl <= 12);
    else if (stockFilter === 'roe') list = list.filter((s) => (s.rentabilidade?.roe ?? 0) >= 15);
    else if (stockFilter === 'azulim') list = list.filter((s) => s.viability?.status === 'azulim');

    if (sortCol !== 'default') {
      list.sort((a, b) => {
        const va = getStockSortVal(a, sortCol);
        const vb = getStockSortVal(b, sortCol);
        if (typeof va === 'string' && typeof vb === 'string') {
          return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return sortDir === 'asc' ? va - vb : vb - va;
      });
    }
    return list.slice(0, 15);
  }, [allStocks, stockFilter, sortCol, sortDir]);

  // Top Dividend Yield movers derived from real fundamentals
  const topDyMovers = React.useMemo(
    () =>
      [...allStocks]
        .filter((s) => typeof s.valuation?.dividendYield === 'number' && s.valuation.dividendYield > 0)
        .sort((a, b) => b.valuation.dividendYield - a.valuation.dividendYield)
        .slice(0, 6)
        .map((s) => ({
          symbol: s.symbol,
          name: s.name,
          logo: s.logo,
          price: s.price,
          value: `${fmtNum(s.valuation.dividendYield, 2, '%')}`,
        })),
    [allStocks]
  );

  const activeMovers =
    moverTab === 'altas'
      ? (rankings?.maioresAltas || []).slice(0, 6)
      : moverTab === 'baixas'
      ? (rankings?.maioresBaixas || []).slice(0, 6)
      : moverTab === 'volume'
      ? (rankings?.maioresVolumes || []).slice(0, 6)
      : topDyMovers;

  return (
    <div>
      {/* Editorial Minimalist Header */}
      <div className="portal-topbar editorial-topbar">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <h1 style={styles.pageTitle}>Mercado Brasileiro</h1>
            <span className="editorial-live-tag">
              <span className="live-dot" style={{ width: 6, height: 6 }} />
              B3 Ao vivo
            </span>
            {lastUpdate && (
              <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
                Atualizado às {lastUpdate}
              </span>
            )}
          </div>
          <p style={styles.pageSub}>
            Cotações, curva macro e balanços oficiais da B3 em um só painel.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '0.45rem 0.75rem', fontSize: '0.78rem', gap: '0.4rem' }}
            onClick={() => fetchAll(true)}
            disabled={refreshing}
            title={lastUpdate ? `Última atualização às ${lastUpdate}` : 'Atualizar cotações'}
            aria-label="Atualizar cotações do mercado"
          >
            <RefreshIcon size={14} />
            <span>{refreshing ? 'Atualizando...' : 'Atualizar'}</span>
          </button>
        </div>
      </div>

      {/* ADVFN-style Recently Viewed Quotes Strip */}
      {recentStocks.length > 0 && (
        <div className="recent-strip" aria-label="Ativos vistos recentemente">
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-subtle)' }}>
            Vistos recentemente:
          </span>
          {recentStocks.map((sym) => {
            const info = stockBySymbol[sym];
            const chg = info?.change;
            return (
              <button
                key={sym}
                type="button"
                className="chip-btn mono"
                style={{ padding: '0.22rem 0.56rem', fontSize: '0.72rem', gap: '0.35rem' }}
                onClick={() => navigate(`/acoes/${sym}`)}
              >
                <span style={{ fontWeight: 700 }}>{sym}</span>
                {typeof chg === 'number' && (
                  <span style={{ color: chg >= 0 ? 'var(--positive)' : 'var(--negative)', fontWeight: 700 }}>
                    {chg >= 0 ? '+' : ''}
                    {chg.toFixed(1).replace('.', ',')}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-primary" onClick={() => fetchAll(true)}>
            Tentar novamente
          </button>
        </div>
      )}

      {/* Market & Macro Summary Strip (5 Unified Cells — TradingView / UOL Economia Style) */}
      <section aria-label="Resumo do mercado e indicadores macroeconômicos" className="portal-summary-strip">
        <div className="portal-summary-cell">
          <div style={styles.cellTop}>
            <span style={styles.cellLabel}>
              {market?.ibovespa?.isProxy ? 'B3 Top 50' : market?.ibovespa?.name || 'B3 Top 50'}
            </span>
            {!loading && market?.summary ? (
              <span className={`pill ${sentiment.cls}`} style={{ fontSize: '0.62rem', padding: '0.08rem 0.4rem' }}>
                {sentiment.label}
              </span>
            ) : (
              <span style={styles.sourceTag}>B3</span>
            )}
          </div>
          {loading ? (
            <div className="skeleton" style={{ height: 22, width: '58%', marginTop: 4 }} />
          ) : (
            <>
              <div
                className="num"
                style={{
                  ...styles.cellVal,
                  color:
                    market?.ibovespa?.change == null
                      ? 'var(--text-primary)'
                      : market.ibovespa.change >= 0
                      ? 'var(--positive)'
                      : 'var(--negative)',
                }}
              >
                {market?.ibovespa?.change != null
                  ? `${market.ibovespa.change >= 0 ? '▲ +' : '▼ '}${Math.abs(market.ibovespa.change).toFixed(2).replace('.', ',')}%`
                  : '—'}
              </div>
              {market?.summary && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: 2 }}>
                  <div style={styles.miniBreadth} aria-hidden="true">
                    <div style={{ width: `${upPct}%`, background: 'var(--positive-bright)', height: '100%' }} />
                    <div style={{ width: `${downPct}%`, background: 'var(--negative-bright)', height: '100%' }} />
                  </div>
                  <span className="mono" style={{ fontSize: '0.67rem', color: 'var(--text-subtle)' }}>
                    {market.summary.stocksUp}↑ {market.summary.stocksDown}↓
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {orderedMacro.length > 0
          ? orderedMacro.map((item) => (
              <div key={item.key} className="portal-summary-cell" title={`Fonte oficial: Banco Central (SGS) · Ref. ${item.ref_date}`}>
                <div style={styles.cellTop}>
                  <span style={styles.cellLabel}>{item.name}</span>
                  <span style={styles.sourceTag}>BCB</span>
                </div>
                <div className="num" style={styles.cellVal}>
                  {fmtMacroVal(item)}
                </div>
                <div className="mono" style={styles.cellMeta}>
                  Ref. {item.ref_date}
                </div>
              </div>
            ))
          : loading
          ? [1, 2, 3, 4].map((n) => (
              <div key={n} className="portal-summary-cell" aria-hidden="true">
                <div className="skeleton" style={{ height: 11, width: '55%', marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 22, width: '48%' }} />
              </div>
            ))
          : ['Dólar PTAX', 'Meta Selic', 'IPCA 12m', 'IPCA Mensal'].map((label) => (
              <div key={label} className="portal-summary-cell">
                <div style={styles.cellTop}>
                  <span style={styles.cellLabel}>{label}</span>
                  <span style={styles.sourceTag}>BCB</span>
                </div>
                <div className="num" style={styles.cellVal}>—</div>
                <div className="mono" style={styles.cellMeta}>Indisponível</div>
              </div>
            ))}
      </section>

      {/* Main 2-Column Financial Portal Grid */}
      <div className="portal-grid">
        {/* LEFT COLUMN: TradingView Spotlight Chart + Oceans14/UOL/ADVFN Tabbed Market Table */}
        <div style={{ minWidth: 0 }}>
          {/* TradingView-style Interactive Market Spotlight Chart */}
          <section className="spotlight-card" aria-label="Gráfico interativo em destaque">
            <div className="spotlight-topbar">
              <div className="spotlight-tickers" role="group" aria-label="Selecionar ativo para o gráfico">
                {spotlightTickers.map((sym) => {
                  const s = stockBySymbol[sym];
                  const chg = s?.change;
                  const active = spotlightSymbol === sym;
                  return (
                    <button
                      key={sym}
                      type="button"
                      className={`spotlight-ticker-btn ${active ? 'active' : ''}`}
                      onClick={() => setSpotlightSymbol(sym)}
                      aria-pressed={active}
                    >
                      <span className="mono">{sym}</span>
                      {typeof chg === 'number' && (
                        <span
                          className="num"
                          style={{
                            fontSize: '0.7rem',
                            color: chg >= 0 ? 'var(--positive)' : 'var(--negative)',
                          }}
                        >
                          {chg >= 0 ? '+' : ''}
                          {chg.toFixed(1).replace('.', ',')}%
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                {spotlightMeta?.price != null && (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem' }}>
                    <span className="num" style={{ fontWeight: 800, fontSize: '0.98rem', color: 'var(--text-primary)' }}>
                      R$ {fmtNum(spotlightMeta.price)}
                    </span>
                    {spotlightMeta.fairValue?.grahamPrice != null && (
                      <span
                        className={`pill num ${
                          (spotlightMeta.fairValue.grahamUpside ?? 0) >= 0 ? 'pill-pos' : 'pill-neg'
                        }`}
                        style={{ fontSize: '0.66rem', padding: '0.12rem 0.45rem' }}
                        title="Preço Justo pela fórmula de Benjamin Graham (√22,5 × LPA × VPA)"
                      >
                        Graham R$ {fmtNum(spotlightMeta.fairValue.grahamPrice)}
                      </span>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '0.3rem 0.68rem', fontSize: '0.75rem' }}
                  onClick={() => navigate(`/acoes/${spotlightSymbol}`)}
                >
                  Análise {spotlightSymbol} →
                </button>
              </div>
            </div>

            <div style={{ padding: '0.85rem 1.05rem 0.75rem' }}>
              <PriceChart symbol={spotlightSymbol} compact embedded defaultRange="3mo" />
            </div>
          </section>

          {/* Tabbed Market Quotes, Fundamentals, Sectors & Heatmap */}
          <section className="card" style={{ overflow: 'hidden' }} aria-label="Cotações e fundamentos da B3">
            <div style={styles.mainCardHeader}>
              <div
                className="tabs-bar"
                role="tablist"
                aria-label="Classes de ativos e visões da B3"
                style={{ marginBottom: 0, borderBottom: 'none' }}
                onKeyDown={(e) => {
                  const idx = MARKET_TABS.findIndex((t) => t.key === marketTab);
                  if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    setMarketTab(MARKET_TABS[(idx + 1) % MARKET_TABS.length].key);
                  } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    setMarketTab(MARKET_TABS[(idx - 1 + MARKET_TABS.length) % MARKET_TABS.length].key);
                  }
                }}
              >
                {MARKET_TABS.map((t) => (
                  <button
                    key={t.key}
                    id={`portal-tab-${t.key}`}
                    type="button"
                    role="tab"
                    aria-selected={marketTab === t.key}
                    aria-controls={`portal-panel-${t.key}`}
                    tabIndex={marketTab === t.key ? 0 : -1}
                    className={`tab-btn ${marketTab === t.key ? 'active' : ''}`}
                    style={{ padding: '0.76rem 0.9rem', fontSize: '0.83rem' }}
                    onClick={() => setMarketTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '0.32rem 0.72rem', fontSize: '0.76rem', marginRight: '0.9rem' }}
                onClick={() => navigate(marketTab === 'fiis' || marketTab === 'etfs' ? '/ativos' : '/acoes')}
              >
                {marketTab === 'fiis'
                  ? 'Todos os FIIs →'
                  : marketTab === 'etfs'
                  ? 'Todos os ETFs →'
                  : 'Screening completo →'}
              </button>
            </div>

            {loading ? (
              <div style={{ padding: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="skeleton" style={{ height: 38 }} />
                ))}
              </div>
            ) : marketTab === 'acoes' ? (
              <div id="portal-panel-acoes" role="tabpanel" aria-labelledby="portal-tab-acoes">
                {/* Oceans14 / UOL Quick Filter Bar */}
                <div className="portal-filter-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {QUICK_FILTERS.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        className={`chip-btn ${stockFilter === f.key ? 'active' : ''}`}
                        style={{ padding: '0.24rem 0.6rem', fontSize: '0.73rem' }}
                        onClick={() => setStockFilter(f.key)}
                        aria-pressed={stockFilter === f.key}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
                    Clique nas colunas para ordenar · {visibleStocks.length} exibidas
                  </span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table compact" style={{ minWidth: '760px' }}>
                    <thead>
                      <tr>
                        <th className="sticky-col" style={{ minWidth: 185 }}>
                          <button type="button" className={`sort-th-btn ${sortCol === 'symbol' ? 'active' : ''}`} onClick={() => handleSort('symbol')}>
                            Ativo {sortArrow('symbol')}
                          </button>
                        </th>
                        <th style={{ textAlign: 'right' }}>
                          <button type="button" className={`sort-th-btn ${sortCol === 'price' ? 'active' : ''}`} onClick={() => handleSort('price')}>
                            Cotação {sortArrow('price')}
                          </button>
                        </th>
                        <th style={{ textAlign: 'right' }}>
                          <button type="button" className={`sort-th-btn ${sortCol === 'change' ? 'active' : ''}`} onClick={() => handleSort('change')}>
                            Dia {sortArrow('change')}
                          </button>
                        </th>
                        <th style={{ textAlign: 'right' }}>
                          <button type="button" className={`sort-th-btn ${sortCol === 'pl' ? 'active' : ''}`} onClick={() => handleSort('pl')}>
                            P/L {sortArrow('pl')}
                          </button>
                        </th>
                        <th style={{ textAlign: 'right' }}>
                          <button type="button" className={`sort-th-btn ${sortCol === 'pvp' ? 'active' : ''}`} onClick={() => handleSort('pvp')}>
                            P/VP {sortArrow('pvp')}
                          </button>
                        </th>
                        <th style={{ textAlign: 'right' }}>
                          <button type="button" className={`sort-th-btn ${sortCol === 'dy' ? 'active' : ''}`} onClick={() => handleSort('dy')}>
                            DY {sortArrow('dy')}
                          </button>
                        </th>
                        <th style={{ textAlign: 'right' }}>
                          <button type="button" className={`sort-th-btn ${sortCol === 'roe' ? 'active' : ''}`} onClick={() => handleSort('roe')}>
                            ROE {sortArrow('roe')}
                          </button>
                        </th>
                        <th style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className={`sort-th-btn ${sortCol === 'graham' ? 'active' : ''}`}
                            onClick={() => handleSort('graham')}
                            title="Margem de segurança estimada pela fórmula de Benjamin Graham"
                          >
                            Graham {sortArrow('graham')}
                          </button>
                        </th>
                        <th style={{ textAlign: 'center' }}>
                          <button type="button" className={`sort-th-btn ${sortCol === 'score' ? 'active' : ''}`} onClick={() => handleSort('score')}>
                            Saúde {sortArrow('score')}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleStocks.length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ textAlign: 'center', padding: '1.8rem', color: 'var(--text-muted)' }}>
                            Nenhuma ação atende a este filtro rápido.
                          </td>
                        </tr>
                      ) : (
                        visibleStocks.map((s) => {
                          const isPos = (s.change ?? 0) >= 0;
                          const starred = isStarred(s.symbol);
                          const gUp = s.fairValue?.grahamUpside;
                          return (
                            <tr
                              key={s.symbol}
                              style={{ cursor: 'pointer' }}
                              onClick={() => navigate(`/acoes/${s.symbol}`)}
                            >
                              <td className="sticky-col">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                  <button
                                    type="button"
                                    className={`star-btn ${starred ? 'starred' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggle(s.symbol);
                                    }}
                                    title={starred ? 'Remover favorito' : 'Favoritar'}
                                    aria-label={starred ? `Remover ${s.symbol} dos favoritos` : `Favoritar ${s.symbol}`}
                                    aria-pressed={starred}
                                  >
                                    <StarIcon size={13} filled={starred} />
                                  </button>
                                  <StockLogo src={s.logo} symbol={s.symbol} size={26} radius={6} />
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                      <span style={{ fontWeight: 700, fontSize: '0.83rem', color: 'var(--text-primary)' }}>
                                        {s.symbol}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSpotlightSymbol(s.symbol);
                                          window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                        title={`Ver gráfico de ${s.symbol} no topo`}
                                        aria-label={`Ver gráfico de ${s.symbol}`}
                                        style={styles.miniChartBtn}
                                      >
                                        <BarChartIcon size={11} />
                                      </button>
                                    </div>
                                    <div style={styles.tableSub}>{s.name}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>
                                {s.price != null ? `R$ ${fmtNum(s.price)}` : '—'}
                              </td>
                              <td
                                className="num"
                                style={{
                                  textAlign: 'right',
                                  fontWeight: 700,
                                  color: s.change == null ? 'var(--text-subtle)' : isPos ? 'var(--positive)' : 'var(--negative)',
                                }}
                              >
                                {s.change != null ? `${isPos ? '+' : ''}${fmtNum(s.change, 2, '%')}` : '—'}
                              </td>
                              <td className="num" style={{ textAlign: 'right' }}>{fmtNum(s.valuation?.pl)}</td>
                              <td className="num" style={{ textAlign: 'right' }}>{fmtNum(s.valuation?.pvp)}</td>
                              <td
                                className="num"
                                style={{
                                  textAlign: 'right',
                                  fontWeight: 600,
                                  color: (s.valuation?.dividendYield ?? 0) >= 6 ? 'var(--positive)' : 'var(--text-primary)',
                                }}
                              >
                                {fmtNum(s.valuation?.dividendYield, 2, '%')}
                              </td>
                              <td
                                className="num"
                                style={{
                                  textAlign: 'right',
                                  fontWeight: 600,
                                  color: (s.rentabilidade?.roe ?? 0) >= 15 ? 'var(--positive)' : 'var(--text-primary)',
                                }}
                              >
                                {fmtNum(s.rentabilidade?.roe, 1, '%')}
                              </td>
                              <td className="num" style={{ textAlign: 'right' }}>
                                {gUp != null ? (
                                  <span
                                    className={`pill num ${gUp >= 0 ? 'pill-pos' : 'pill-neg'}`}
                                    style={{ fontSize: '0.69rem', padding: '0.12rem 0.44rem' }}
                                    title={`Preço Justo Graham: R$ ${fmtNum(s.fairValue.grahamPrice)}`}
                                  >
                                    {gUp >= 0 ? '+' : ''}
                                    {fmtNum(gUp, 0, '%')}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <ViabilityBadge viability={s.viability} />
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : marketTab === 'fiis' ? (
              <div id="portal-panel-fiis" role="tabpanel" aria-labelledby="portal-tab-fiis" style={{ overflowX: 'auto' }}>
                <table className="data-table compact" style={{ minWidth: '580px' }}>
                  <thead>
                    <tr>
                      <th className="sticky-col" style={{ minWidth: 190 }}>Fundo Imobiliário</th>
                      <th style={{ textAlign: 'right' }}>Cotação</th>
                      <th style={{ textAlign: 'right' }}>Dia</th>
                      <th style={{ textAlign: 'right' }}>P/VP (CVM)</th>
                      <th style={{ textAlign: 'right' }}>DY Anual.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fiis.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                          {fiisLoaded ? 'Nenhum FII disponível no momento.' : 'Carregando fundos imobiliários...'}
                        </td>
                      </tr>
                    ) : (
                      fiis.map((f) => {
                        const isPos = (f.change ?? 0) >= 0;
                        return (
                          <tr key={f.symbol} style={{ cursor: 'pointer' }} onClick={() => navigate(`/acoes/${f.symbol}`)}>
                            <td className="sticky-col">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                                <StockLogo src={f.logo} symbol={f.symbol} size={28} radius={7} />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>{f.symbol}</div>
                                  <div style={styles.tableSub}>{f.sector || f.name}</div>
                                </div>
                              </div>
                            </td>
                            <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>
                              {f.price != null ? `R$ ${fmtNum(f.price)}` : '—'}
                            </td>
                            <td
                              className="num"
                              style={{
                                textAlign: 'right',
                                fontWeight: 700,
                                color: isPos ? 'var(--positive)' : 'var(--negative)',
                              }}
                            >
                              {f.change != null ? `${isPos ? '+' : ''}${fmtNum(f.change, 2, '%')}` : '—'}
                            </td>
                            <td
                              className="num"
                              style={{
                                textAlign: 'right',
                                fontWeight: 600,
                                color: f.pvp != null && f.pvp < 1 ? 'var(--positive)' : 'var(--text-primary)',
                              }}
                            >
                              {fmtNum(f.pvp)}
                            </td>
                            <td
                              className="num"
                              style={{
                                textAlign: 'right',
                                fontWeight: 700,
                                color: (f.dy ?? 0) >= 9 ? 'var(--positive)' : 'var(--text-primary)',
                              }}
                            >
                              {fmtNum(f.dy, 2, '%')}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : marketTab === 'etfs' ? (
              <div id="portal-panel-etfs" role="tabpanel" aria-labelledby="portal-tab-etfs" style={{ overflowX: 'auto' }}>
                <table className="data-table compact" style={{ minWidth: '520px' }}>
                  <thead>
                    <tr>
                      <th className="sticky-col" style={{ minWidth: 200 }}>ETF</th>
                      <th style={{ textAlign: 'right' }}>Cotação</th>
                      <th style={{ textAlign: 'right' }}>Dia</th>
                      <th style={{ textAlign: 'right' }}>Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {etfs.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                          {etfsLoaded ? 'Nenhum ETF disponível no momento.' : 'Carregando ETFs...'}
                        </td>
                      </tr>
                    ) : (
                      etfs.map((etf) => {
                        const isPos = (etf.change ?? 0) >= 0;
                        return (
                          <tr key={etf.symbol} style={{ cursor: 'pointer' }} onClick={() => navigate(`/acoes/${etf.symbol}`)}>
                            <td className="sticky-col">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                                <StockLogo src={etf.logo} symbol={etf.symbol} size={28} radius={7} />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>{etf.symbol}</div>
                                  <div style={styles.tableSub}>{etf.name}</div>
                                </div>
                              </div>
                            </td>
                            <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>
                              {etf.price != null ? `R$ ${fmtNum(etf.price)}` : '—'}
                            </td>
                            <td
                              className="num"
                              style={{
                                textAlign: 'right',
                                fontWeight: 700,
                                color: isPos ? 'var(--positive)' : 'var(--negative)',
                              }}
                            >
                              {etf.change != null ? `${isPos ? '+' : ''}${fmtNum(etf.change, 2, '%')}` : '—'}
                            </td>
                            <td className="num" style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                              {fmtVol(etf.volume)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : marketTab === 'setores' ? (
              <div id="portal-panel-setores" role="tabpanel" aria-labelledby="portal-tab-setores">
                <SectorPerformance sectors={market?.sectors || []} />
              </div>
            ) : (
              <div id="portal-panel-mapa" role="tabpanel" aria-labelledby="portal-tab-mapa" style={{ padding: '0.75rem' }}>
                <MarketHeatmap items={market?.heatmap || []} />
              </div>
            )}
          </section>
        </div>

        {/* RIGHT SIDEBAR: Movimentação B3 + Conversor Dólar PTAX + Radar Quantitativo + Favoritos */}
        <aside className="portal-sidebar" aria-label="Destaques, câmbio e radar do pregão">
          {/* Movers Widget (ADVFN style — Altas / Baixas / Volume / Top DY) */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={styles.sideHeader}>
              <h2 style={styles.sideTitle}>Movimentação B3</h2>
              <div className="segmented-tabs" role="tablist" aria-label="Tipo de movimentação">
                {MOVER_TABS.map((mt) => (
                  <button
                    key={mt.key}
                    type="button"
                    role="tab"
                    aria-selected={moverTab === mt.key}
                    className={`segmented-tab ${moverTab === mt.key ? 'active' : ''}`}
                    onClick={() => setMoverTab(mt.key)}
                  >
                    {mt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              {loading ? (
                <div style={{ padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 34 }} />)}
                </div>
              ) : activeMovers.length === 0 ? (
                <div style={{ padding: '1.25rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Sem dados disponíveis
                </div>
              ) : (
                activeMovers.map((item) => {
                  const valColor =
                    moverTab === 'altas' || moverTab === 'dy'
                      ? 'var(--positive)'
                      : moverTab === 'baixas'
                      ? 'var(--negative)'
                      : 'var(--text-primary)';
                  return (
                    <div
                      key={`${moverTab}-${item.symbol}`}
                      role="button"
                      tabIndex={0}
                      className="ranking-row"
                      style={{ padding: '0.56rem 0.95rem' }}
                      onClick={() => navigate(`/acoes/${item.symbol}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/acoes/${item.symbol}`);
                        }
                      }}
                    >
                      <StockLogo src={item.logo} symbol={item.symbol} size={28} radius={7} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.83rem', color: 'var(--text-primary)' }}>
                          {item.symbol}
                        </div>
                        <div style={styles.tableSub}>{item.name}</div>
                      </div>
                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div className="num" style={{ fontWeight: 700, fontSize: '0.82rem', color: valColor }}>
                          {item.value}
                        </div>
                        {typeof item.price === 'number' && (
                          <div className="num" style={{ fontSize: '0.69rem', color: 'var(--text-subtle)' }}>
                            R$ {item.price.toFixed(2).replace('.', ',')}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Live USD <-> BRL PTAX Currency Converter (UOL Economia Cotações) */}
          <CurrencyConverter ptax={macroMap.ptax_usd} />

          {/* Quant Radar Widget */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={styles.sideHeader}>
              <h2 style={{ ...styles.sideTitle, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ color: 'var(--brand)', display: 'flex' }}><ShieldCheckIcon size={15} /></span>
                Radar Quantitativo
              </h2>
              <button
                type="button"
                onClick={() => navigate('/inteligencia')}
                style={styles.sideLink}
              >
                Ver todos →
              </button>
            </div>
            <div>
              {quantTop.length === 0 ? (
                <div style={{ padding: '1.1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {loading ? 'Carregando oportunidades...' : 'Sem dados quantitativos disponíveis.'}
                </div>
              ) : (
                quantTop.map((q) => (
                  <div
                    key={q.symbol}
                    role="button"
                    tabIndex={0}
                    className="ranking-row"
                    style={{ padding: '0.6rem 0.95rem' }}
                    onClick={() => navigate(`/acoes/${q.symbol}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/acoes/${q.symbol}`);
                      }
                    }}
                  >
                    <StockLogo src={q.logo} symbol={q.symbol} size={28} radius={7} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.83rem', color: 'var(--text-primary)' }}>
                        {q.symbol}
                      </div>
                      <div style={styles.tableSub}>{q.sector}</div>
                    </div>
                    <span className="pill pill-pos num" style={{ fontSize: '0.72rem', padding: '0.18rem 0.52rem' }}>
                      {Math.round(q.score)}/100
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Personal Watchlist Mini Card (only if user has favorites) */}
          {watchlist.length > 0 && (
            <div className="card" style={{ padding: '0.9rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                  <span style={{ color: '#f59e0b', display: 'flex' }}><StarIcon size={13} filled /></span>
                  Seus Favoritos
                </span>
                {watchlist.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => navigate(`/comparar?tickers=${watchlist.slice(0, 4).join(',')}`)}
                    style={styles.sideLink}
                  >
                    <ScaleIcon size={12} /> Comparar
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.38rem' }}>
                {watchlist.map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    className="chip-btn mono"
                    style={{ padding: '0.26rem 0.62rem', fontSize: '0.75rem' }}
                    onClick={() => navigate(`/acoes/${sym}`)}
                  >
                    {sym}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

const styles = {
  pageTitle: {
    margin: 0,
    fontSize: 'clamp(1.25rem, 2.2vw, 1.55rem)',
    fontWeight: 800,
    letterSpacing: '-0.03em',
    color: 'var(--text-primary)',
    lineHeight: 1.2,
  },
  pageSub: {
    margin: '0.22rem 0 0',
    fontSize: '0.82rem',
    color: 'var(--text-muted)',
  },
  searchIcon: {
    paddingLeft: '0.65rem',
    color: 'var(--text-subtle)',
    display: 'flex',
    pointerEvents: 'none',
  },
  searchInput: {
    flex: 1,
    padding: '0.45rem 0.6rem',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)',
    fontSize: '0.85rem',
    outline: 'none',
    minWidth: 0,
  },
  miniName: {
    fontSize: '0.72rem',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 190,
  },
  cellTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.35rem',
  },
  cellLabel: {
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
  },
  sourceTag: {
    fontSize: '0.62rem',
    fontWeight: 700,
    color: 'var(--text-subtle)',
    background: 'var(--bg-surface-subtle)',
    border: '1px solid var(--border-subtle)',
    padding: '0.05rem 0.36rem',
    borderRadius: 4,
  },
  cellVal: {
    fontSize: '1.12rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
    letterSpacing: '-0.02em',
  },
  cellMeta: {
    fontSize: '0.67rem',
    color: 'var(--text-subtle)',
  },
  miniBreadth: {
    flex: 1,
    maxWidth: 92,
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
    display: 'flex',
    background: 'var(--border-subtle)',
  },
  mainCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    flexWrap: 'wrap',
    borderBottom: '1px solid var(--border-subtle)',
    paddingLeft: '0.35rem',
  },
  tableSub: {
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 155,
  },
  miniChartBtn: {
    appearance: 'none',
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-surface-subtle)',
    color: 'var(--text-subtle)',
    borderRadius: 5,
    padding: '0.12rem 0.24rem',
    display: 'inline-flex',
    alignItems: 'center',
    cursor: 'pointer',
  },
  sideHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    padding: '0.78rem 0.95rem',
    borderBottom: '1px solid var(--border-subtle)',
    flexWrap: 'wrap',
  },
  sideTitle: {
    margin: 0,
    fontSize: '0.88rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  sideLink: {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    color: 'var(--brand)',
    fontSize: '0.74rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: 0,
  },
};

export default Home;
