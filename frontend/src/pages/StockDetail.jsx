import React from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import IndicatorCard from '../components/IndicatorCard';
import ViabilityBadge, { getViabilityColor } from '../components/ViabilityBadge';
import PriceChart from '../components/PriceChart';
import DividendsPanel from '../components/DividendsPanel';
import CorporateEventsPanel from '../components/CorporateEventsPanel';
import { DividendSimulator, StudyNotes } from '../components/StudyTools';
import { showToast } from '../components/Toast';
import {
  ArrowLeftIcon,
  ScaleIcon,
  FilterIcon,
  StarIcon,
  ShieldCheckIcon,
  CalculatorIcon,
  TrendingUpIcon,
  BuildingIcon,
  BarChartIcon,
  CheckCircleIcon,
  ExternalLinkIcon,
  BookOpenIcon,
  PrinterIcon,
  WalletIcon,
} from '../components/Icons';
import { useWatchlist } from '../hooks/useWatchlist';
import { recordRecentStock } from '../hooks/useRecentStocks';
import { apiFetch } from '../api';
import { safeHttpUrl } from '../utils/security';
import { fmtNum, fmtMoney, fmtVol } from '../utils/format';
import StockLogo from '../components/StockLogo';

function RadialScore({ score, color }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, score ?? 0));
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: 92, height: 92, flexShrink: 0 }}>
      <svg width="92" height="92" viewBox="0 0 92 92" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="46" cy="46" r={radius} fill="none" stroke="var(--border-subtle)" strokeWidth="8" />
        <circle
          cx="46"
          cy="46"
          r={radius}
          fill="none"
          stroke={color || '#0f766e'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span className="num" style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>
          {score ?? '—'}
        </span>
        <span style={{ fontSize: '0.62rem', color: 'var(--text-subtle)', fontWeight: 700 }}>/100</span>
      </div>
    </div>
  );
}

function FairPriceBox({ title, formula, fairPrice, currentPrice, upside }) {
  const isDiscount = upside != null && upside >= 0;
  const maxRef = Math.max(fairPrice || 0, currentPrice || 0, 1);
  const currentBar = currentPrice ? Math.round((currentPrice / maxRef) * 100) : 0;
  const fairBar = fairPrice ? Math.round((fairPrice / maxRef) * 100) : 0;

  return (
    <div style={styles.fairBox}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div>
          <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
          <div className="mono" style={{ fontSize: '0.69rem', color: 'var(--text-subtle)' }}>{formula}</div>
        </div>
        {upside != null && (
          <span className={`pill num ${isDiscount ? 'pill-pos' : 'pill-neg'}`}>
            {isDiscount ? '+' : ''}{fmtNum(upside, 1, '%')}
          </span>
        )}
      </div>

      <div className="num" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.5rem 0 0.35rem' }}>
        {fairPrice ? `R$ ${fmtNum(fairPrice)}` : '—'}
      </div>

      {upside != null && (
        <div style={{ fontSize: '0.73rem', color: isDiscount ? 'var(--positive)' : 'var(--negative)', fontWeight: 600, marginBottom: '0.55rem' }}>
          {isDiscount
            ? `Margem de segurança estimada de ${fmtNum(upside, 1, '%')}`
            : `Negociada ${fmtNum(Math.abs(upside), 1, '%')} acima da referência`}
        </div>
      )}

      {fairPrice && currentPrice && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.7rem' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: 2 }}>
              <span>Preço Atual</span>
              <span className="num">R$ {fmtNum(currentPrice)}</span>
            </div>
            <div style={styles.miniTrack}>
              <div style={{ width: `${currentBar}%`, height: '100%', background: '#64748b', borderRadius: 4 }} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: 2 }}>
              <span>Valor Justo</span>
              <span className="num">R$ {fmtNum(fairPrice)}</span>
            </div>
            <div style={styles.miniTrack}>
              <div
                style={{
                  width: `${fairBar}%`,
                  height: '100%',
                  background: isDiscount ? '#10b981' : '#f43f5e',
                  borderRadius: 4,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FinancialBars({ fin }) {
  const perfItems = [
    { label: 'Receita Total', value: fin.totalRevenue, color: '#0f766e' },
    { label: 'EBITDA', value: fin.ebitda, color: '#0284c7' },
    { label: 'Fluxo de Caixa Livre', value: fin.freeCashflow, color: '#10b981' },
  ].filter((x) => typeof x.value === 'number' && x.value !== 0);

  const debtItems = [
    { label: 'Caixa Total', value: fin.totalCash, color: '#10b981' },
    { label: 'Dívida Total', value: fin.totalDebt, color: '#f43f5e' },
  ].filter((x) => typeof x.value === 'number' && x.value !== 0);

  const maxPerf = Math.max(...perfItems.map((i) => Math.abs(i.value)), 1);
  const maxDebt = Math.max(...debtItems.map((i) => Math.abs(i.value)), 1);

  return (
    <div style={styles.twoColGrid}>
      {perfItems.length > 0 && (
        <div className="card" style={{ padding: '1.15rem 1.25rem' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.85rem' }}>
            Geração de Resultado (12m)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {perfItems.map((item) => (
              <div key={item.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{item.label}</span>
                  <strong className="num">{fmtMoney(item.value)}</strong>
                </div>
                <div style={{ height: 9, background: 'var(--border-subtle)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(4, (Math.abs(item.value) / maxPerf) * 100)}%`, height: '100%', background: item.color, borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {debtItems.length > 0 && (
        <div className="card" style={{ padding: '1.15rem 1.25rem' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.85rem' }}>
            Caixa vs. Dívida Bruta
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {debtItems.map((item) => (
              <div key={item.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{item.label}</span>
                  <strong className="num">{fmtMoney(item.value)}</strong>
                </div>
                <div style={{ height: 9, background: 'var(--border-subtle)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(4, (Math.abs(item.value) / maxDebt) * 100)}%`, height: '100%', background: item.color, borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StockDetail() {
  const { symbol } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isStarred, toggle } = useWatchlist();
  const [stock, setStock] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const validTabs = ['resumo', 'indicadores', 'dividendos', 'simulador', 'tese'];
  const initialTab = validTabs.includes(searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'resumo';
  const [activeTab, setActiveTab] = React.useState(initialTab);
  const [quickPortfolioOpen, setQuickPortfolioOpen] = React.useState(false);
  const [quickQty, setQuickQty] = React.useState('100');
  const [quickPrice, setQuickPrice] = React.useState('');
  const [savingPortfolio, setSavingPortfolio] = React.useState(false);
  const [loadingCompare, setLoadingCompare] = React.useState(false);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setQuickPortfolioOpen(false);
    const paramTab = searchParams.get('tab');
    setActiveTab(validTabs.includes(paramTab) ? paramTab : 'resumo');
    apiFetch(`/api/indicators/${encodeURIComponent(symbol)}`, { signal: controller.signal })
      .then((json) => {
        setStock(json);
        setQuickPrice(typeof json.price === 'number' ? json.price.toFixed(2) : '');
        recordRecentStock(json.symbol);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
        setLoading(false);
      });
    return () => controller.abort();
  }, [symbol, searchParams]);

  const handleSmartCompare = async () => {
    if (!stock?.symbol) return;
    setLoadingCompare(true);
    try {
      const res = await apiFetch(`/api/intelligence/sector-peers/${encodeURIComponent(stock.symbol)}`);
      const peerSymbols = (res.peers || [])
        .map((p) => p.symbol)
        .filter((s) => s && s !== stock.symbol)
        .slice(0, 3);
      if (peerSymbols.length > 0) {
        navigate(`/comparar?tickers=${[stock.symbol, ...peerSymbols].join(',')}`);
        return;
      }
    } catch {}
    finally {
      setLoadingCompare(false);
    }
    const fallback = ['PETR4', 'VALE3', 'ITUB4'].filter((s) => s !== stock.symbol).slice(0, 2);
    navigate(`/comparar?tickers=${[stock.symbol, ...fallback].join(',')}`);
  };

  const handleQuickAddPortfolio = async (e) => {
    e.preventDefault();
    const qtyNum = parseInt(quickQty, 10);
    const priceNum = parseFloat(String(quickPrice).replace(',', '.'));
    if (!Number.isInteger(qtyNum) || qtyNum <= 0 || !Number.isFinite(priceNum) || priceNum <= 0) {
      showToast('Informe quantidade inteira e preço médio positivos.', 'error');
      return;
    }
    setSavingPortfolio(true);
    try {
      const saved = await apiFetch('/api/investments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: stock.symbol,
          quantity: qtyNum,
          avg_price: priceNum,
          consolidate: true,
        }),
      });
      setQuickPortfolioOpen(false);
      showToast(
        saved.consolidated
          ? `Aporte em ${stock.symbol} consolidado na carteira (PM R$ ${Number(saved.avg_price).toFixed(2).replace('.', ',')}).`
          : `${stock.symbol} adicionado à sua carteira!`,
        'success'
      );
    } catch (err) {
      showToast(err.message || 'Falha ao salvar na carteira.', 'error');
    } finally {
      setSavingPortfolio(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="skeleton" style={{ height: 54, width: '50%', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 22, width: '30%' }} />
        </div>
        <div className="skeleton" style={{ height: 240, width: '100%', borderRadius: 12 }} />
      </div>
    );
  }

  if (error || !stock) {
    return (
      <div className="card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 0.5rem 0' }}>{error || 'Ativo não encontrado'}</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
          Verifique o ticker digitado ou explore as ações disponíveis no Screening.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button onClick={() => navigate('/acoes')} className="btn btn-primary">
            <FilterIcon size={15} /> Ir para Screening
          </button>
          <button onClick={() => navigate('/')} className="btn btn-ghost">
            Voltar ao Mercado
          </button>
        </div>
      </div>
    );
  }

  const starred = isStarred(stock.symbol);
  const isPos = (stock.change ?? 0) >= 0;
  const v = stock.valuation || {};
  const r = stock.rentabilidade || {};
  const e = stock.endividamento || {};
  const fv = stock.fairValue || {};
  const viab = stock.viability || {};
  const viabDotColor = getViabilityColor(viab.status);
  const fin = stock.financials || {};
  const prof = stock.profile || {};

  const range52 =
    stock.fiftyTwoWeekHigh && stock.fiftyTwoWeekLow
      ? stock.fiftyTwoWeekHigh - stock.fiftyTwoWeekLow
      : 0;
  const pos52 =
    range52 > 0
      ? Math.min(100, Math.max(0, ((stock.price - stock.fiftyTwoWeekLow) / range52) * 100))
      : null;

  const tabs = [
    { key: 'resumo', label: 'Visão Geral & Gráfico', icon: <TrendingUpIcon size={15} /> },
    { key: 'indicadores', label: 'Indicadores', icon: <BarChartIcon size={15} /> },
    { key: 'dividendos', label: 'Dividendos', icon: <CheckCircleIcon size={15} /> },
    { key: 'simulador', label: 'Simulador', icon: <CalculatorIcon size={15} /> },
    { key: 'eventos', label: 'Comunicados CVM', icon: <InfoIcon size={15} /> },
    { key: 'tese', label: 'Caderno de Tese', icon: <BookOpenIcon size={15} /> },
  ];

  return (
    <div>
      {/* Top Action Bar + Contextual Breadcrumb */}
      <div style={styles.topBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost" style={{ padding: '0.4rem 0.78rem', fontSize: '0.8rem' }}>
            <ArrowLeftIcon size={14} /> Voltar
          </button>
          <nav aria-label="Navegação estrutural" className="breadcrumb">
            <Link to="/">Mercado</Link>
            <span aria-hidden="true">/</span>
            <Link to={stock.symbol.endsWith('11') ? '/ativos' : '/acoes'}>
              {stock.symbol.endsWith('11') ? 'FIIs & ETFs' : 'Ações'}
            </Link>
            <span aria-hidden="true">/</span>
            <span className="mono" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{stock.symbol}</span>
          </nav>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => toggle(stock.symbol)}
            aria-pressed={starred}
            style={starred ? { borderColor: '#f59e0b', color: '#f59e0b' } : undefined}
          >
            <StarIcon size={15} filled={starred} />
            {starred ? 'Favoritado' : 'Favoritar'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setQuickPortfolioOpen((v) => !v)}
            aria-expanded={quickPortfolioOpen}
          >
            <WalletIcon size={15} /> + Carteira
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => window.print()}
            title="Imprimir ou salvar ficha em PDF"
          >
            <PrinterIcon size={15} /> PDF
          </button>
          <button
            type="button"
            onClick={handleSmartCompare}
            disabled={loadingCompare}
            className="btn btn-primary"
          >
            <ScaleIcon size={15} /> {loadingCompare ? 'Buscando pares...' : `Comparar ${stock.symbol}`}
          </button>
        </div>
      </div>

      {/* Inline Quick Add to Portfolio Drawer (Zero Context Switching) */}
      {quickPortfolioOpen && (
        <form
          onSubmit={handleQuickAddPortfolio}
          className="card"
          style={{
            padding: '1rem 1.2rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.85rem',
          }}
        >
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Registrar aporte de {stock.symbol} na Minha Carteira
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Se você já possui {stock.symbol}, o preço médio ponderado será recalculado automaticamente.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', width: 110 }}>
              <label htmlFor="quick-qty" style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Quantidade
              </label>
              <input
                id="quick-qty"
                type="number"
                min="1"
                step="1"
                value={quickQty}
                onChange={(e) => setQuickQty(e.target.value)}
                className="field-input mono"
                required
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', width: 130 }}>
              <label htmlFor="quick-price" style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Preço Médio (R$)
              </label>
              <input
                id="quick-price"
                type="number"
                min="0.01"
                step="0.01"
                value={quickPrice}
                onChange={(e) => setQuickPrice(e.target.value)}
                className="field-input mono"
                required
              />
            </div>
            <button type="submit" className="btn btn-emerald" disabled={savingPortfolio}>
              <CheckCircleIcon size={14} /> {savingPortfolio ? 'Salvando...' : 'Registrar'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setQuickPortfolioOpen(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Hero Stock Header */}
      <div className="card" style={styles.headerCard}>
        <div style={styles.headerLeft}>
          <StockLogo src={stock.logo} symbol={stock.symbol} size={62} radius={14} />
          <div>
            <div style={styles.tickerRow}>
              <h1 style={styles.symbolTitle}>{stock.symbol}</h1>
              {prof.listingSegment && <span className="pill pill-brand">{prof.listingSegment}</span>}
              <ViabilityBadge viability={viab} showScore />
              <span className="pill pill-neutral" style={{ gap: '0.4rem' }}>
                <span className="live-dot" style={{ width: 6, height: 6 }} />
                {stock.source === 'brapi-live'
                  ? 'B3 ao vivo'
                  : stock.source === 'live-price+fundamentals'
                  ? 'B3 ao vivo · Fundamentos'
                  : 'Base Fundamentalista'}
              </span>
            </div>
            <div style={styles.companyName}>{stock.name}</div>
            <div style={styles.sectorRow}>
              {stock.sector && <span className="pill pill-brand">{stock.sector}</span>}
              {stock.subsector && <span className="pill pill-neutral">{stock.subsector}</span>}
            </div>
          </div>
        </div>

        <div className="stock-header-right">
          <div style={styles.priceLabel}>Cotação Atual</div>
          <div className="price-row-flex" style={styles.priceRow}>
            <span className="num" style={styles.bigPrice}>
              R$ {stock.price != null ? stock.price.toFixed(2).replace('.', ',') : '—'}
            </span>
            {stock.change != null && (
              <span className={`pill num ${isPos ? 'pill-pos' : 'pill-neg'}`} style={{ fontSize: '0.88rem', padding: '0.32rem 0.7rem' }}>
                {isPos ? '▲ +' : '▼ '}{stock.change.toFixed(2).replace('.', ',')}%
              </span>
            )}
          </div>
          {stock.marketCap && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              Valor de Mercado: <strong className="num" style={{ color: 'var(--text-primary)' }}>{fmtMoney(stock.marketCap)}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Organized Tabs with Keyboard Arrow Support */}
      <div
        className="tabs-bar"
        role="tablist"
        aria-label={`Seções de análise de ${stock.symbol}`}
        onKeyDown={(e) => {
          const idx = tabs.findIndex((t) => t.key === activeTab);
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            setActiveTab(tabs[(idx + 1) % tabs.length].key);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length].key);
          }
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            id={`tab-${t.key}`}
            role="tab"
            aria-selected={activeTab === t.key}
            aria-controls={`panel-${t.key}`}
            tabIndex={activeTab === t.key ? 0 : -1}
            className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: Visão Geral & Gráfico */}
      {activeTab === 'resumo' && (
        <div id="panel-resumo" role="tabpanel" aria-labelledby="tab-resumo" className="tab-panel-animate" style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          {/* Interactive Historical Price Chart */}
          <PriceChart symbol={stock.symbol} />

          {/* Quick Key Metrics Strip */}
          <div style={styles.cardsGrid}>
            <IndicatorCard
              title="P/L"
              value={fmtNum(v.pl)}
              subtitle="Preço / Lucro"
              color="#0f766e"
              highlight={v.pl > 0 && v.pl <= 12 ? 'positive' : v.pl < 0 ? 'negative' : undefined}
              tooltip="Anos de lucro atual necessários para recuperar o valor investido. Abaixo de 12–15 sugere desconto."
            />
            <IndicatorCard
              title="P/VP"
              value={fmtNum(v.pvp)}
              subtitle="Preço / Valor Patrimonial"
              color="#0f766e"
              highlight={v.pvp > 0 && v.pvp <= 1.2 ? 'positive' : undefined}
              tooltip="Compara a cotação com o patrimônio líquido contábil por ação."
            />
            <IndicatorCard
              title="Dividend Yield"
              value={fmtNum(v.dividendYield, 2, '%')}
              subtitle="Proventos (12m)"
              color="#10b981"
              highlight={v.dividendYield >= 6 ? 'positive' : undefined}
              tooltip="Percentual pago em dividendos e JCP nos últimos 12 meses frente ao preço atual."
            />
            <IndicatorCard
              title="ROE"
              value={fmtNum(r.roe, 2, '%')}
              subtitle="Retorno s/ Patrimônio"
              color="#10b981"
              highlight={r.roe >= 15 ? 'positive' : r.roe < 0 ? 'negative' : undefined}
              tooltip="Eficiência da empresa em gerar lucro com o capital dos acionistas. Acima de 15% é excelente."
            />
            <IndicatorCard
              title="Margem Líquida"
              value={fmtNum(r.margemLiquida, 2, '%')}
              subtitle="Lucro / Receita"
              color="#059669"
              tooltip="Quanto sobra de lucro líquido para cada R$ 100 faturados."
            />
            <IndicatorCard
              title="Dív. Líq. / EBITDA"
              value={fmtNum(e.dividaLiquidaEbitda)}
              subtitle="Alavancagem"
              color="#f59e0b"
              highlight={e.dividaLiquidaEbitda != null ? (e.dividaLiquidaEbitda <= 2 ? 'positive' : e.dividaLiquidaEbitda > 3.5 ? 'negative' : undefined) : undefined}
              tooltip="Anos de EBITDA necessários para quitar a dívida líquida."
            />
          </div>

          {/* Viability + Fair Value */}
          <div style={styles.twoColGrid}>
            <div className="card" style={{ padding: '1.35rem' }}>
              <div style={styles.panelHeader}>
                <h2 className="section-title" style={{ fontSize: '0.98rem' }}>
                  <span style={{ color: viabDotColor, display: 'flex' }}><ShieldCheckIcon size={18} /></span>
                  Saúde Fundamentalista
                </h2>
                <ViabilityBadge viability={viab} />
              </div>

              {viab.reasons && viab.reasons.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                  <RadialScore score={viab.score} color={viabDotColor} />
                  <ul style={styles.reasonsList}>
                    {viab.reasons.map((reason, i) => (
                      <li key={i} style={styles.reasonItem}>
                        <span style={{ color: viabDotColor, display: 'flex', flexShrink: 0 }}>
                          <CheckCircleIcon size={14} />
                        </span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', margin: 0 }}>
                  Indicadores fundamentalistas completos indisponíveis para cálculo automático deste ativo.
                </p>
              )}
            </div>

            <div className="card" style={{ padding: '1.35rem' }}>
              <div style={styles.panelHeader}>
                <h2 className="section-title" style={{ fontSize: '0.98rem' }}>
                  <span style={{ color: 'var(--brand)', display: 'flex' }}><CalculatorIcon size={18} /></span>
                  Preço Justo (Graham & Bazin)
                </h2>
              </div>
              <div style={styles.fairGrid}>
                <FairPriceBox
                  title="Fórmula de Graham"
                  formula="√(22,5 × LPA × VPA)"
                  fairPrice={fv.grahamPrice}
                  currentPrice={stock.price}
                  upside={fv.grahamUpside}
                />
                <FairPriceBox
                  title="Preço Teto Bazin"
                  formula="Dividendo Anual ÷ 6%"
                  fairPrice={fv.bazinPrice}
                  currentPrice={stock.price}
                  upside={fv.bazinUpside}
                />
              </div>
            </div>
          </div>

          {/* Company Profile */}
          {prof.summary && (
            <section className="card" style={{ padding: '1.4rem' }}>
              <h2 className="section-title" style={{ marginBottom: '0.85rem' }}>
                <BuildingIcon size={18} /> Sobre {stock.name}
              </h2>
              <p style={styles.summaryText}>{prof.summary}</p>
              <div style={styles.profileMeta}>
                {prof.cnpj && <span><strong>CNPJ:</strong> <span className="mono">{prof.cnpj}</span></span>}
                {prof.employees && <span><strong>Funcionários:</strong> <span className="num">{prof.employees.toLocaleString('pt-BR')}</span></span>}
                {safeHttpUrl(prof.website) && (
                  <a
                    href={safeHttpUrl(prof.website)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--brand)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' }}
                  >
                    Site Institucional / RI <ExternalLinkIcon size={13} />
                  </a>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* TAB 2: Indicadores Completos */}
      {activeTab === 'indicadores' && (
        <div id="panel-indicadores" role="tabpanel" aria-labelledby="tab-indicadores" className="tab-panel-animate">
          <section style={styles.section}>
            <div className="section-heading">
              <h2 className="section-title">
                <span style={{ color: '#0f766e', display: 'flex' }}><BarChartIcon size={18} /></span>
                Indicadores de Valuation
              </h2>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                Toque ou passe o mouse em (i) para estudar cada indicador
              </span>
            </div>
            <div style={styles.cardsGrid}>
              <IndicatorCard title="P/L" value={fmtNum(v.pl)} subtitle="Preço / Lucro" color="#0f766e" highlight={v.pl > 0 && v.pl <= 12 ? 'positive' : v.pl < 0 ? 'negative' : undefined} tooltip="Indica em quantos anos você recuperaria o valor investido com o lucro atual da empresa." />
              <IndicatorCard title="P/VP" value={fmtNum(v.pvp)} subtitle="Preço / Valor Patrimonial" color="#0f766e" highlight={v.pvp > 0 && v.pvp <= 1.2 ? 'positive' : undefined} tooltip="Compara o preço de mercado com o patrimônio líquido contábil por ação." />
              <IndicatorCard title="Dividend Yield" value={fmtNum(v.dividendYield, 2, '%')} subtitle="Proventos (12m)" color="#10b981" highlight={v.dividendYield >= 6 ? 'positive' : undefined} tooltip="Percentual pago em dividendos e JCP nos últimos 12 meses." />
              <IndicatorCard title="EV / EBITDA" value={fmtNum(v.evEbitda)} subtitle="Valor da Firma / EBITDA" color="#0f766e" tooltip="Quantos anos de geração operacional de caixa pagariam o valor total da empresa incluindo dívidas." />
              <IndicatorCard title="LPA" value={v.lpa != null ? `R$ ${fmtNum(v.lpa)}` : '—'} subtitle="Lucro por Ação" color="#0284c7" tooltip="Lucro líquido dividido pela quantidade de ações." />
              <IndicatorCard title="VPA" value={v.vpa != null ? `R$ ${fmtNum(v.vpa)}` : '—'} subtitle="Valor Patrimonial / Ação" color="#0284c7" tooltip="Patrimônio líquido dividido pelo número de ações." />
            </div>
          </section>

          <section style={styles.section}>
            <div className="section-heading">
              <h2 className="section-title">
                <span style={{ color: '#10b981', display: 'flex' }}><TrendingUpIcon size={18} /></span>
                Rentabilidade e Eficiência
              </h2>
            </div>
            <div style={styles.cardsGrid}>
              <IndicatorCard title="ROE" value={fmtNum(r.roe, 2, '%')} subtitle="Retorno s/ Patrimônio" color="#10b981" highlight={r.roe >= 15 ? 'positive' : r.roe < 0 ? 'negative' : undefined} tooltip="Eficiência da empresa em gerar lucro com capital próprio." />
              <IndicatorCard title="ROA" value={fmtNum(r.roa, 2, '%')} subtitle="Retorno sobre Ativos" color="#10b981" tooltip="Retorno gerado sobre o total de ativos da companhia." />
              <IndicatorCard title="ROIC" value={fmtNum(r.roic, 2, '%')} subtitle="Retorno s/ Capital Investido" color="#10b981" tooltip="Retorno operacional sobre todo o capital alocado no negócio." />
              <IndicatorCard title="Margem Líquida" value={fmtNum(r.margemLiquida, 2, '%')} subtitle="Lucro Líquido / Receita" color="#059669" highlight={r.margemLiquida >= 15 ? 'positive' : r.margemLiquida < 0 ? 'negative' : undefined} tooltip="Percentual da receita que vira lucro líquido." />
              <IndicatorCard title="Margem EBITDA" value={fmtNum(r.margemEbitda, 2, '%')} subtitle="EBITDA / Receita" color="#059669" tooltip="Percentual da receita convertido em geração operacional de caixa." />
              {r.margemBruta != null && (
                <IndicatorCard title="Margem Bruta" value={fmtNum(r.margemBruta, 2, '%')} subtitle="Lucro Bruto / Receita" color="#059669" tooltip="Poder de precificação descontando custos diretos." />
              )}
            </div>
          </section>

          <section style={styles.section}>
            <div className="section-heading">
              <h2 className="section-title">
                <span style={{ color: '#f59e0b', display: 'flex' }}><BuildingIcon size={18} /></span>
                Endividamento e Negociação
              </h2>
            </div>
            <div style={styles.cardsGrid}>
              <IndicatorCard title="Dív. Líquida (R$)" value={fmtMoney(e.dividaLiquida)} subtitle="Dívida Bruta − Caixa" color="#f59e0b" tooltip="Saldo real de dívida após descontar o caixa disponível. Negativo indica caixa líquido." />
              <IndicatorCard title="Dív. Líquida / EBITDA" value={fmtNum(e.dividaLiquidaEbitda)} subtitle={e.dividaLiquidaEbitda != null && e.dividaLiquidaEbitda < 0 ? 'Caixa líquido positivo' : 'Alavancagem operacional'} color="#f59e0b" highlight={e.dividaLiquidaEbitda != null ? (e.dividaLiquidaEbitda <= 2 ? 'positive' : e.dividaLiquidaEbitda > 3.5 ? 'negative' : undefined) : undefined} tooltip="Abaixo de 2,5x é saudável; negativo indica mais caixa que dívida." />
              <IndicatorCard title="Dív. Líquida / PL" value={fmtNum(e.dividaLiquidaPl)} subtitle="Alavancagem patrimonial" color="#f59e0b" tooltip="Proporção da dívida líquida sobre o patrimônio líquido." />
              <IndicatorCard title="Cresc. Receita" value={stock.crescimento?.receita != null ? `${stock.crescimento.receita >= 0 ? '+' : ''}${fmtNum(stock.crescimento.receita, 1, '%')}` : '—'} subtitle="Variação reportada" color="#475569" highlight={stock.crescimento?.receita > 0 ? 'positive' : stock.crescimento?.receita < 0 ? 'negative' : undefined} tooltip="Crescimento da receita líquida com base nos dados oficiais disponíveis." />
              <IndicatorCard title="Cresc. Lucro" value={stock.crescimento?.lucro != null ? `${stock.crescimento.lucro >= 0 ? '+' : ''}${fmtNum(stock.crescimento.lucro, 1, '%')}` : '—'} subtitle="Variação reportada" color="#475569" highlight={stock.crescimento?.lucro > 0 ? 'positive' : stock.crescimento?.lucro < 0 ? 'negative' : undefined} tooltip="Crescimento do lucro líquido reportado." />
              {e.liquidezCorrente != null && (
                <IndicatorCard title="Liquidez Corrente" value={fmtNum(e.liquidezCorrente)} subtitle="Curto prazo (AC / PC)" color="#f59e0b" tooltip="Acima de 1,0 indica folga para pagar contas de curto prazo." />
              )}
              <IndicatorCard title="Volume Negociado" value={fmtVol(stock.volume)} subtitle="Ações no pregão" color="#475569" />
              <IndicatorCard title="Mín / Máx do Dia" value={stock.dayLow && stock.dayHigh ? `R$ ${fmtNum(stock.dayLow)} – ${fmtNum(stock.dayHigh)}` : '—'} subtitle="Oscilação intradiária" color="#475569" />
              <IndicatorCard title="Faixa 52 Semanas" value={stock.fiftyTwoWeekLow && stock.fiftyTwoWeekHigh ? `R$ ${fmtNum(stock.fiftyTwoWeekLow)} – ${fmtNum(stock.fiftyTwoWeekHigh)}` : '—'} subtitle={pos52 != null ? `Posição atual: ${Math.round(pos52)}% da faixa` : 'Mínima e máxima anual'} color="#475569" />
            </div>
          </section>

          {(fin.totalRevenue || fin.ebitda || fin.freeCashflow) && (
            <section style={styles.section}>
              <div className="section-heading">
                <h2 className="section-title">Demonstrativos Financeiros (12 meses)</h2>
              </div>
              <FinancialBars fin={fin} />
            </section>
          )}
        </div>
      )}

      {/* TAB 3: Dividendos Reais */}
      {activeTab === 'dividendos' && (
        <div id="panel-dividendos" role="tabpanel" aria-labelledby="tab-dividendos" className="tab-panel-animate">
          <DividendsPanel symbol={stock.symbol} />
        </div>
      )}

      {/* TAB 4: Simulador de Dividendos & Aportes */}
      {activeTab === 'simulador' && (
        <div id="panel-simulador" role="tabpanel" aria-labelledby="tab-simulador" className="tab-panel-animate">
          <DividendSimulator
            symbol={stock.symbol}
            price={stock.price}
            dividendYield={v.dividendYield}
          />
        </div>
      )}

      {/* TAB 4B: Comunicados Oficiais CVM */}
      {activeTab === 'eventos' && (
        <div id="panel-eventos" role="tabpanel" aria-labelledby="tab-eventos" className="tab-panel-animate">
          <CorporateEventsPanel symbol={stock.symbol} />
        </div>
      )}

      {/* TAB 5: Caderno de Tese */}
      {activeTab === 'tese' && (
        <div id="panel-tese" role="tabpanel" aria-labelledby="tab-tese" className="tab-panel-animate">
          <StudyNotes symbol={stock.symbol} currentPrice={stock.price} />
        </div>
      )}
    </div>
  );
}

const styles = {
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
    flexWrap: 'wrap',
    gap: '0.6rem',
  },
  headerCard: {
    padding: '1.5rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '1.25rem',
    marginBottom: '1.1rem',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '1.05rem' },
  tickerRow: { display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' },
  symbolTitle: { margin: 0, fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--text-primary)' },
  companyName: { fontSize: '0.94rem', color: 'var(--text-secondary)', marginTop: '0.2rem' },
  sectorRow: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' },
  headerRight: { textAlign: 'right' },
  priceLabel: { fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' },
  priceRow: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.15rem' },
  bigPrice: { fontSize: '2.1rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' },
  twoColGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: '1.15rem' },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' },
  reasonsList: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.45rem', flex: 1, minWidth: '200px' },
  reasonItem: { display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.84rem', color: 'var(--text-secondary)' },
  fairGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' },
  fairBox: { background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '0.95rem' },
  miniTrack: { height: '6px', background: 'var(--border-subtle)', borderRadius: '4px', overflow: 'hidden' },
  section: { marginBottom: '1.75rem' },
  cardsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))', gap: '0.9rem' },
  summaryText: { fontSize: '0.88rem', lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-line', margin: '0 0 1rem 0' },
  profileMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1.25rem',
    fontSize: '0.82rem',
    color: 'var(--text-muted)',
    borderTop: '1px solid var(--border-subtle)',
    paddingTop: '0.85rem',
  },
};

export default StockDetail;
