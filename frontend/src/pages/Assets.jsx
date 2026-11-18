import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BuildingIcon, SearchIcon, StarIcon, RefreshIcon } from '../components/Icons';
import StockLogo from '../components/StockLogo';
import { useWatchlist } from '../hooks/useWatchlist';
import { apiFetch } from '../api';

function fmt(v, dec = 2, suffix = '') {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return `${Number(v).toFixed(dec).replace('.', ',')}${suffix}`;
}

function fmtVol(v) {
  if (!v) return '—';
  if (v >= 1e6) return `${(v / 1e6).toFixed(2).replace('.', ',')} M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1).replace('.', ',')} K`;
  return v.toLocaleString('pt-BR');
}

function Assets() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isStarred, toggle } = useWatchlist();

  const initialTab = ['fii', 'etf'].includes(searchParams.get('type')) ? searchParams.get('type') : 'fii';
  const [assetType, setAssetType] = React.useState(initialTab);
  const [query, setQuery] = React.useState('');
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [sortKey, setSortKey] = React.useState('volume');
  const [sortDir, setSortDir] = React.useState('desc');

  const loadAssets = React.useCallback((type) => {
    setLoading(true);
    setError(null);
    apiFetch(`/api/assets?type=${type}`)
      .then((d) => {
        setItems(d.assets || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    setSearchParams({ type: assetType }, { replace: true });
    loadAssets(assetType);
  }, [assetType, loadAssets, setSearchParams]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'symbol' ? 'asc' : 'desc');
    }
  };

  const filtered = React.useMemo(() => {
    const q = query.trim().toUpperCase();
    return items
      .filter((i) => !q || i.symbol.includes(q) || (i.name || '').toUpperCase().includes(q))
      .sort((a, b) => {
        const va = a[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity);
        const vb = b[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity);
        if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        return sortDir === 'asc' ? va - vb : vb - va;
      });
  }, [items, query, sortKey, sortDir]);

  const arrow = (k) => (sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');
  const upCount = items.filter((i) => (i.change ?? 0) > 0).length;
  const discountedFiis = items.filter((i) => i.pvp != null && i.pvp > 0 && i.pvp < 1).length;
  const highDyFiis = items.filter((i) => i.dy != null && i.dy >= 9).length;

  return (
    <div>
      <div style={styles.headerRow}>
        <div>
          <div className="page-eyebrow">Fundos Listados na B3</div>
          <h1 style={styles.title}>
            <span style={{ color: 'var(--brand)', display: 'inline-flex' }}><BuildingIcon size={22} /></span>
            Fundos Imobiliários (FIIs) & ETFs
          </h1>
          <p style={styles.subtitle}>
            Cotações e liquidez em tempo real combinadas com P/VP e Dividend Yield oficiais do Informe Mensal da CVM.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => loadAssets(assetType)}>
          <RefreshIcon size={14} /> Atualizar
        </button>
      </div>

      {/* KPI Summary Strip */}
      {!loading && items.length > 0 && (
        <div style={styles.kpiRow}>
          <div className="card" style={styles.kpiCard}>
            <span style={styles.kpiLabel}>{assetType === 'fii' ? 'FIIs Listados' : 'ETFs Listados'}</span>
            <strong className="num" style={styles.kpiVal}>{items.length}</strong>
          </div>
          <div className="card" style={styles.kpiCard}>
            <span style={styles.kpiLabel}>Em Alta Hoje</span>
            <strong className="num" style={{ ...styles.kpiVal, color: 'var(--positive)' }}>{upCount}</strong>
          </div>
          {assetType === 'fii' && (
            <>
              <div className="card" style={styles.kpiCard}>
                <span style={styles.kpiLabel}>Com Desconto (P/VP &lt; 1)</span>
                <strong className="num" style={{ ...styles.kpiVal, color: 'var(--brand)' }}>{discountedFiis}</strong>
              </div>
              <div className="card" style={styles.kpiCard}>
                <span style={styles.kpiLabel}>DY Anualizado ≥ 9%</span>
                <strong className="num" style={{ ...styles.kpiVal, color: 'var(--positive)' }}>{highDyFiis}</strong>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tabs: FIIs | ETFs */}
      <div className="tabs-bar">
        <button
          className={`tab-btn ${assetType === 'fii' ? 'active' : ''}`}
          onClick={() => setAssetType('fii')}
        >
          Fundos Imobiliários (FIIs)
        </button>
        <button
          className={`tab-btn ${assetType === 'etf' ? 'active' : ''}`}
          onClick={() => setAssetType('etf')}
        >
          ETFs de Índice
        </button>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>Erro ao carregar ativos: {error}</span>
          <button className="btn btn-primary" onClick={() => loadAssets(assetType)}>Tentar novamente</button>
        </div>
      )}

      {/* Search bar */}
      <div style={{ position: 'relative', maxWidth: 420, marginBottom: '1rem' }}>
        <span style={styles.searchIcon}><SearchIcon size={15} /></span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={assetType === 'fii' ? 'Filtrar FII (ex: MXRF11, HGLG11, KNSC11...)' : 'Filtrar ETF (ex: BOVA11, SMAL11, GOLD11...)'}
          className="field-input"
          style={{ paddingLeft: '2.35rem' }}
        />
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={styles.meta}>
          <span>Exibindo <strong className="num">{filtered.length}</strong> {assetType === 'fii' ? 'FIIs' : 'ETFs'} listados na B3</span>
        </div>

        {loading ? (
          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ height: 42 }} />)}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  {[
                    ['symbol', 'Ativo', 'sticky-col'], ['price', 'Cotação', ''], ['change', 'Var. Dia', ''], ['volume', 'Volume', ''],
                  ].map(([key, label, className]) => (
                    <th key={key} className={className} style={{ textAlign: key === 'symbol' ? 'left' : 'right' }}>
                      <button type="button" className="sortable-col" style={{ justifyContent: key === 'symbol' ? 'flex-start' : 'flex-end' }} onClick={() => handleSort(key)} aria-label={`Ordenar por ${label}`}>
                        {label}{arrow(key)}
                      </button>
                    </th>
                  ))}
                  <th style={{ textAlign: 'right' }}>DY (12m)</th>
                  <th style={{ textAlign: 'right' }}>P/VP</th>
                  <th style={{ textAlign: 'center' }}>Classe</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isPos = (item.change ?? 0) >= 0;
                  const starred = isStarred(item.symbol);
                  return (
                    <tr key={item.symbol}>
                      <td className="sticky-col">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                          <button
                            className={`star-btn ${starred ? 'starred' : ''}`}
                            onClick={() => toggle(item.symbol)}
                            title={starred ? 'Remover favorito' : 'Favoritar'}
                          >
                            <StarIcon size={14} filled={starred} />
                          </button>
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', minWidth: 0 }}
                            role="button"
                            tabIndex={0}
                            onClick={() => navigate(`/acoes/${item.symbol}`)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                navigate(`/acoes/${item.symbol}`);
                              }
                            }}
                          >
                            <StockLogo src={item.logo} symbol={item.symbol} size={30} radius={7} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.symbol}</div>
                              <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
                                {item.name}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>R$ {fmt(item.price)}</td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: isPos ? 'var(--positive)' : 'var(--negative)' }}>
                        {isPos ? '+' : ''}{fmt(item.change, 2, '%')}
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>{fmtVol(item.volume)}</td>
                      <td className="num" style={{ textAlign: 'right', color: item.dy != null ? 'var(--positive)' : 'var(--text-subtle)' }}>
                        {fmt(item.dy, 2, '%')}
                      </td>
                      <td className="num" style={{ textAlign: 'right', color: item.pvp != null ? 'var(--text-primary)' : 'var(--text-subtle)' }}>
                        {fmt(item.pvp)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="pill pill-brand">{item.assetType.toUpperCase()}</span>
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
  );
}

const styles = {
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' },
  title: { margin: '0 0 0.25rem 0', fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' },
  subtitle: { margin: 0, fontSize: '0.86rem', color: 'var(--text-muted)' },
  searchIcon: { position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)', display: 'flex', pointerEvents: 'none' },
  meta: { padding: '0.85rem 1.1rem', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.84rem', color: 'var(--text-secondary)' },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem', marginBottom: '1.1rem' },
  kpiCard: { padding: '0.9rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.18rem' },
  kpiLabel: { fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  kpiVal: { fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' },
};

export default Assets;

