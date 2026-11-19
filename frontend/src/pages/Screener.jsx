import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ScaleIcon, StarIcon, XIcon, RefreshIcon } from '../components/Icons';
import ViabilityBadge from '../components/ViabilityBadge';
import { showToast } from '../components/Toast';
import { useWatchlist } from '../hooks/useWatchlist';
import { apiFetch } from '../api';
import { escapeCsvCell } from '../utils/security';
import StockLogo from '../components/StockLogo';

const FILTER_STORAGE_KEY = 'investanalytics_saved_screener_v1';

function fmt(v, dec = 2, suffix = '') {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return `${Number(v).toFixed(dec).replace('.', ',')}${suffix}`;
}

function Screener() {
  const navigate = useNavigate();
  const { isStarred, toggle } = useWatchlist();
  const [stocks, setStocks] = React.useState([]);
  const [sectors, setSectors] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const [query, setQuery] = React.useState('');
  const [sector, setSector] = React.useState('Todos');
  const [viability, setViability] = React.useState('Todos');
  const [minDy, setMinDy] = React.useState('');
  const [maxPl, setMaxPl] = React.useState('');
  const [minRoe, setMinRoe] = React.useState('');
  const [maxPvp, setMaxPvp] = React.useState('');
  const [onlyStarred, setOnlyStarred] = React.useState(false);
  const [activePreset, setActivePreset] = React.useState('');

  const [sortKey, setSortKey] = React.useState('dy');
  const [sortDir, setSortDir] = React.useState('desc');
  const [selected, setSelected] = React.useState([]);
  const [compact, setCompact] = React.useState(() => {
    try {
      return localStorage.getItem('investanalytics_screener_density') === 'compact';
    } catch {
      return false;
    }
  });

  const toggleDensity = () => {
    setCompact((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('investanalytics_screener_density', next ? 'compact' : 'comfortable');
      } catch {}
      return next;
    });
  };

  const loadScreener = React.useCallback(() => {
    setLoading(true);
    setError(null);
    apiFetch('/api/indicators')
      .then((json) => {
        setStocks(json.stocks || []);
        setSectors(json.sectors || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    loadScreener();
  }, [loadScreener]);

  const clearFilters = () => {
    setQuery('');
    setSector('Todos');
    setViability('Todos');
    setMinDy('');
    setMaxPl('');
    setMinRoe('');
    setMaxPvp('');
    setOnlyStarred(false);
    setActivePreset('');
  };

  const saveCurrentFilter = () => {
    const payload = { query, sector, viability, minDy, maxPl, minRoe, maxPvp, onlyStarred };
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(payload));
    showToast('Filtro salvo no navegador!', 'success');
  };

  const loadSavedFilter = () => {
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) {
        showToast('Nenhum filtro salvo ainda.', 'info');
        return;
      }
      const f = JSON.parse(raw);
      setQuery(f.query || '');
      setSector(f.sector || 'Todos');
      setViability(f.viability || 'Todos');
      setMinDy(f.minDy || '');
      setMaxPl(f.maxPl || '');
      setMinRoe(f.minRoe || '');
      setMaxPvp(f.maxPvp || '');
      setOnlyStarred(Boolean(f.onlyStarred));
      setActivePreset('salvo');
      showToast('Filtro salvo aplicado!', 'info');
    } catch {
      showToast('Erro ao carregar filtro salvo.', 'error');
    }
  };

  const applyPreset = (preset) => {
    if (activePreset === preset) {
      clearFilters();
      return;
    }
    clearFilters();
    setActivePreset(preset);
    if (preset === 'dividendos') {
      setMinDy('6');
      setSortKey('dy');
      setSortDir('desc');
    } else if (preset === 'qualidade') {
      setMinRoe('15');
      setSortKey('roe');
      setSortDir('desc');
    } else if (preset === 'baratas') {
      setMaxPl('10');
      setMaxPvp('1.5');
      setSortKey('pl');
      setSortDir('asc');
    } else if (preset === 'atrativas') {
      setViability('azulim');
      setSortKey('score');
      setSortDir('desc');
    } else if (preset === 'favoritos') {
      setOnlyStarred(true);
    }
  };

  const toggleSelect = (symbol) => {
    setSelected((prev) => {
      if (prev.includes(symbol)) return prev.filter((s) => s !== symbol);
      if (prev.length >= 4) return prev;
      return [...prev, symbol];
    });
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'pl' || key === 'pvp' || key === 'symbol' ? 'asc' : 'desc');
    }
  };

  const filtered = React.useMemo(() => {
    return stocks
      .filter((s) => {
        if (onlyStarred && !isStarred(s.symbol)) return false;
        if (query.trim()) {
          const t = query.trim().toUpperCase();
          if (!s.symbol.includes(t) && !s.name.toUpperCase().includes(t)) return false;
        }
        if (sector !== 'Todos' && s.sector !== sector) return false;
        if (viability !== 'Todos' && s.viability?.status !== viability) return false;
        if (minDy !== '' && (s.valuation?.dividendYield ?? -Infinity) < parseFloat(minDy)) return false;
        if (maxPl !== '' && (s.valuation?.pl == null || s.valuation.pl <= 0 || s.valuation.pl > parseFloat(maxPl))) return false;
        if (minRoe !== '' && (s.rentabilidade?.roe ?? -Infinity) < parseFloat(minRoe)) return false;
        if (maxPvp !== '' && (s.valuation?.pvp == null || s.valuation.pvp > parseFloat(maxPvp))) return false;
        return true;
      })
      .sort((a, b) => {
        const getVal = (item) => {
          switch (sortKey) {
            case 'symbol': return item.symbol;
            case 'price': return item.price ?? -Infinity;
            case 'change': return item.change ?? -Infinity;
            case 'pl': return item.valuation?.pl ?? (sortDir === 'asc' ? Infinity : -Infinity);
            case 'pvp': return item.valuation?.pvp ?? (sortDir === 'asc' ? Infinity : -Infinity);
            case 'dy': return item.valuation?.dividendYield ?? -Infinity;
            case 'roe': return item.rentabilidade?.roe ?? -Infinity;
            case 'margem': return item.rentabilidade?.margemLiquida ?? -Infinity;
            case 'graham': return item.fairValue?.grahamUpside ?? -Infinity;
            case 'score': return item.viability?.score ?? -Infinity;
            default: return 0;
          }
        };
        const va = getVal(a);
        const vb = getVal(b);
        if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        return sortDir === 'asc' ? va - vb : vb - va;
      });
  }, [stocks, query, sector, viability, minDy, maxPl, minRoe, maxPvp, onlyStarred, isStarred, sortKey, sortDir]);

  const exportCsv = () => {
    const headers = ['Ticker', 'Empresa', 'Setor', 'Cotacao', 'VarDia%', 'PL', 'PVP', 'DY%', 'ROE%', 'MargemLiq%', 'Graham', 'Viabilidade', 'Score'];
    const rows = filtered.map((s) =>
      [
        s.symbol,
        s.name || '',
        s.sector || '',
        s.price ?? '',
        s.change ?? '',
        s.valuation?.pl ?? '',
        s.valuation?.pvp ?? '',
        s.valuation?.dividendYield ?? '',
        s.rentabilidade?.roe ?? '',
        s.rentabilidade?.margemLiquida ?? '',
        s.fairValue?.grahamPrice ?? '',
        s.viability?.label ?? '',
        s.viability?.score ?? '',
      ].map(escapeCsvCell)
    );
    const csv = [headers.map(escapeCsvCell).join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `screening-b3-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exportado ${filtered.length} ações em CSV.`, 'success');
  };

  const sortArrow = (k) => (sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');
  const hasFilters = query || sector !== 'Todos' || viability !== 'Todos' || minDy || maxPl || minRoe || maxPvp || onlyStarred;

  return (
    <div>
      <div style={styles.headerRow}>
        <div>
          <span className="page-eyebrow">B3 · Filtro Fundamentalista</span>
          <h1 style={styles.title}>Filtro de Ações</h1>
          <p style={styles.subtitle}>
            Filtre empresas listadas por P/L, P/VP, dividendos, rentabilidade e margem de segurança.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={saveCurrentFilter} style={{ fontSize: '0.8rem' }}>
            Salvar filtro
          </button>
          <button className="btn btn-ghost" onClick={loadSavedFilter} style={{ fontSize: '0.8rem' }}>
            Meu filtro salvo
          </button>
          <button className="btn btn-primary" onClick={exportCsv} disabled={filtered.length === 0} style={{ fontSize: '0.8rem' }}>
            Exportar CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>Erro ao carregar screening: {typeof error === 'object' ? (error?.message || JSON.stringify(error)) : String(error)}</span>
          <button className="btn btn-primary" onClick={loadScreener}>
            <RefreshIcon size={14} /> Tentar novamente
          </button>
        </div>
      )}

      {/* Quick Presets */}
      <div style={styles.presetsRow}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>Estratégias:</span>
        <button onClick={() => applyPreset('atrativas')} className={`chip-btn ${activePreset === 'atrativas' ? 'active' : ''}`}>
          Selo Atrativa
        </button>
        <button onClick={() => applyPreset('dividendos')} className={`chip-btn ${activePreset === 'dividendos' ? 'active' : ''}`}>
          Dividendos (DY ≥ 6%)
        </button>
        <button onClick={() => applyPreset('baratas')} className={`chip-btn ${activePreset === 'baratas' ? 'active' : ''}`}>
          Descontadas (P/L ≤ 10 & P/VP ≤ 1,5)
        </button>
        <button onClick={() => applyPreset('qualidade')} className={`chip-btn ${activePreset === 'qualidade' ? 'active' : ''}`}>
          Alta Rentabilidade (ROE ≥ 15%)
        </button>
        <button onClick={() => applyPreset('favoritos')} className={`chip-btn ${activePreset === 'favoritos' ? 'active' : ''}`}>
          <StarIcon size={13} filled={activePreset === 'favoritos'} /> Favoritos
        </button>
        {hasFilters && (
          <button onClick={clearFilters} className="btn btn-ghost" style={{ padding: '0.32rem 0.7rem', fontSize: '0.76rem', color: 'var(--negative)' }}>
            <XIcon size={13} /> Limpar
          </button>
        )}
      </div>

      {/* Filter Panel */}
      <div className="card" style={styles.filterCard}>
        <div style={styles.filterGrid}>
          <div style={styles.field}>
            <label style={styles.label}>Ticker / Empresa</label>
            <input type="text" value={query} onChange={(e) => { setQuery(e.target.value); setActivePreset(''); }} placeholder="Ex: PETR4, Banco..." className="field-input" />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Setor</label>
            <select value={sector} onChange={(e) => { setSector(e.target.value); setActivePreset(''); }} className="field-input">
              <option value="Todos">Todos os setores</option>
              {sectors.map((sec) => (
                <option key={sec} value={sec}>{sec}</option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Viabilidade</label>
            <select value={viability} onChange={(e) => { setViability(e.target.value); setActivePreset(''); }} className="field-input">
              <option value="Todos">Todos os selos</option>
              <option value="azulim">Atrativa</option>
              <option value="viavel">Viável</option>
              <option value="atencao">Requer atenção</option>
              <option value="risco">Alto risco</option>
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>DY Mínimo (%)</label>
            <input type="number" step="0.5" value={minDy} onChange={(e) => { setMinDy(e.target.value); setActivePreset(''); }} placeholder="Ex: 6" className="field-input" />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>P/L Máximo</label>
            <input type="number" step="1" value={maxPl} onChange={(e) => { setMaxPl(e.target.value); setActivePreset(''); }} placeholder="Ex: 15" className="field-input" />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>ROE Mínimo (%)</label>
            <input type="number" step="1" value={minRoe} onChange={(e) => { setMinRoe(e.target.value); setActivePreset(''); }} placeholder="Ex: 15" className="field-input" />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>P/VP Máximo</label>
            <input type="number" step="0.1" value={maxPvp} onChange={(e) => { setMaxPvp(e.target.value); setActivePreset(''); }} placeholder="Ex: 2" className="field-input" />
          </div>
        </div>
      </div>

      {/* Results Table with Sticky Ticker Column */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={styles.tableMeta}>
          <span>
            Exibindo <strong className="num">{filtered.length}</strong> de <span className="num">{stocks.length}</span> ações
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-subtle)' }}>
              Selecione 2 a 4 empresas para comparar
            </span>
            <button
              className="chip-btn"
              style={{ padding: '0.25rem 0.65rem', fontSize: '0.74rem' }}
              onClick={toggleDensity}
              title="Alternar espaçamento das linhas da tabela"
            >
              Densidade: {compact ? 'Compacta' : 'Confortável'}
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton" style={{ height: 42, width: '100%' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Nenhuma empresa corresponde aos filtros selecionados.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className={`data-table ${compact ? 'compact' : ''}`} style={{ minWidth: '940px' }}>
              <thead>
                <tr>
                  <th className="sticky-col" style={{ minWidth: 205 }}>
                    <button type="button" className="sortable-col" onClick={() => handleSort('symbol')} aria-label="Ordenar por ativo">
                      Ativo{sortArrow('symbol')}
                    </button>
                  </th>
                  <th style={{ textAlign: 'center', width: 42 }} title="Selecionar para comparar">
                    <ScaleIcon size={14} />
                  </th>
                  {[
                    ['price', 'Cotação', 'right'], ['change', 'Dia', 'right'], ['pl', 'P/L', 'right'],
                    ['pvp', 'P/VP', 'right'], ['dy', 'DY', 'right'], ['roe', 'ROE', 'right'],
                    ['margem', 'M. Líq.', 'right'], ['graham', 'Graham', 'right'], ['score', 'Viabilidade', 'center'],
                  ].map(([key, label, align]) => (
                    <th key={key} style={{ textAlign: align }}>
                      <button type="button" className="sortable-col" style={{ justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start' }} onClick={() => handleSort(key)} aria-label={`Ordenar por ${label}`}>
                        {label}{sortArrow(key)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const isPos = (s.change ?? 0) >= 0;
                  const gUpside = s.fairValue?.grahamUpside;
                  const isChecked = selected.includes(s.symbol);
                  const starred = isStarred(s.symbol);

                  return (
                    <tr key={s.symbol} className={isChecked ? 'row-selected' : undefined}>
                      <td className="sticky-col">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                          <button
                            className={`star-btn ${starred ? 'starred' : ''}`}
                            onClick={() => toggle(s.symbol)}
                            title={starred ? 'Remover favorito' : 'Favoritar'}
                            aria-label={starred ? `Remover ${s.symbol} dos favoritos` : `Adicionar ${s.symbol} aos favoritos`}
                          >
                            <StarIcon size={14} filled={starred} />
                          </button>
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', minWidth: 0 }}
                            role="button"
                            tabIndex={0}
                            onClick={() => navigate(`/acoes/${s.symbol}`)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                navigate(`/acoes/${s.symbol}`);
                              }
                            }}
                          >
                            <StockLogo src={s.logo} symbol={s.symbol} size={30} radius={7} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{s.symbol}</div>
                              <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
                                {s.name}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelect(s.symbol)}
                          disabled={!isChecked && selected.length >= 4}
                          style={{ cursor: 'pointer', accentColor: 'var(--brand)' }}
                        />
                      </td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>
                        R$ {fmt(s.price)}
                      </td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: isPos ? 'var(--positive)' : 'var(--negative)' }}>
                        {s.change != null ? `${isPos ? '+' : ''}${fmt(s.change, 2, '%')}` : '—'}
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>{fmt(s.valuation?.pl)}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{fmt(s.valuation?.pvp)}</td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: (s.valuation?.dividendYield ?? 0) >= 6 ? 'var(--positive)' : 'var(--text-primary)' }}>
                        {fmt(s.valuation?.dividendYield, 2, '%')}
                      </td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 600, color: (s.rentabilidade?.roe ?? 0) >= 15 ? 'var(--positive)' : 'var(--text-primary)' }}>
                        {fmt(s.rentabilidade?.roe, 1, '%')}
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>{fmt(s.rentabilidade?.margemLiquida, 1, '%')}</td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {s.fairValue?.grahamPrice ? (
                          <div>
                            <div style={{ fontWeight: 600 }}>R$ {fmt(s.fairValue.grahamPrice)}</div>
                            {gUpside != null && (
                              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: gUpside >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                                {gUpside >= 0 ? '+' : ''}{fmt(gUpside, 0, '%')}
                              </div>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <ViabilityBadge viability={s.viability} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating Compare Pill Bar */}
      {selected.length >= 2 && (
        <div className="floating-bar">
          <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>
            <strong className="mono">{selected.join(' · ')}</strong> ({selected.length}/4)
          </span>
          <button
            className="btn btn-emerald"
            style={{ padding: '0.42rem 0.95rem', fontSize: '0.82rem', borderRadius: '999px' }}
            onClick={() => navigate(`/comparar?tickers=${selected.join(',')}`)}
          >
            <ScaleIcon size={14} /> Comparar agora
          </button>
          <button
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex' }}
            onClick={() => setSelected([])}
            title="Limpar seleção"
            aria-label="Limpar ativos selecionados para comparação"
          >
            <XIcon size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '1rem',
    marginBottom: '1rem',
  },
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
  subtitle: { margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' },
  presetsRow: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '1rem' },
  filterCard: { padding: '1.1rem', marginBottom: '1.25rem' },
  filterGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.85rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  label: { fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  tableMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.5rem',
    padding: '0.9rem 1.1rem',
    borderBottom: '1px solid var(--border-subtle)',
    fontSize: '0.84rem',
    color: 'var(--text-secondary)',
  },
};

export default Screener;
