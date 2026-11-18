import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  SearchIcon,
  TrendingUpIcon,
  FilterIcon,
  ScaleIcon,
  BookOpenIcon,
  StarIcon,
  SunIcon,
  MoonIcon,
  XIcon,
  BuildingIcon,
  ShieldCheckIcon,
  WalletIcon,
} from './Icons';
import StockLogo from './StockLogo';
import { apiFetch } from '../api';
import { sanitizeTicker } from '../utils/security';
import { useWatchlist } from '../hooks/useWatchlist';
import { useRecentStocks } from '../hooks/useRecentStocks';

function CommandPalette({ open, onClose, theme, toggleTheme }) {
  const navigate = useNavigate();
  const { watchlist } = useWatchlist();
  const recent = useRecentStocks();
  const inputRef = React.useRef(null);

  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(0);

  React.useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setLoading(false);
      setActiveIdx(0);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      apiFetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((d) => {
          setResults((d.results || []).slice(0, 8));
          setActiveIdx(0);
          setLoading(false);
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            setResults([]);
            setLoading(false);
          }
        });
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  if (!open) return null;

  const quickActions = [
    { id: 'act-home', label: 'Ir para Visão Geral do Mercado', icon: <TrendingUpIcon size={15} />, run: () => navigate('/') },
    { id: 'act-screener', label: 'Abrir Screening de Ações', icon: <FilterIcon size={15} />, run: () => navigate('/acoes') },
    { id: 'act-assets', label: 'Explorar FIIs & ETFs da B3', icon: <BuildingIcon size={15} />, run: () => navigate('/ativos') },
    { id: 'act-compare', label: 'Abrir Comparador Avançado', icon: <ScaleIcon size={15} />, run: () => navigate('/comparar') },
    { id: 'act-intel', label: 'Inteligência Quantitativa & Radar Diário', icon: <ShieldCheckIcon size={15} />, run: () => navigate('/inteligencia') },
    { id: 'act-portfolio', label: 'Abrir Minha Carteira', icon: <WalletIcon size={15} />, run: () => navigate('/carteira') },
    { id: 'act-studies', label: 'Meus Estudos & Listas de Acompanhamento', icon: <BookOpenIcon size={15} />, run: () => navigate('/estudos') },
    {
      id: 'act-theme',
      label: theme === 'dark' ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro',
      icon: theme === 'dark' ? <SunIcon size={15} /> : <MoonIcon size={15} />,
      run: () => toggleTheme(),
    },
  ];

  // Build flat navigable list for keyboard arrows
  const flatItems = [];
  if (query.trim()) {
    for (const s of results) {
      flatItems.push({ type: 'stock', key: `res-${s.symbol}`, stock: s, run: () => navigate(`/acoes/${s.symbol}`) });
    }
    const directTicker = sanitizeTicker(query);
    if (directTicker && !results.some((r) => r.symbol === directTicker)) {
      flatItems.push({
        type: 'direct',
        key: `direct-${directTicker}`,
        symbol: directTicker,
        run: () => navigate(`/acoes/${directTicker}`),
      });
    }
  } else {
    for (const sym of recent) {
      flatItems.push({ type: 'recent', key: `rec-${sym}`, symbol: sym, run: () => navigate(`/acoes/${sym}`) });
    }
    for (const sym of watchlist.slice(0, 4)) {
      if (!recent.includes(sym)) {
        flatItems.push({ type: 'fav', key: `fav-${sym}`, symbol: sym, run: () => navigate(`/acoes/${sym}`) });
      }
    }
    for (const act of quickActions) {
      flatItems.push({ type: 'action', key: act.id, action: act, run: act.run });
    }
  }

  const executeItem = (item) => {
    if (!item) return;
    item.run();
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown' && flatItems.length > 0) {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % flatItems.length);
    } else if (e.key === 'ArrowUp' && flatItems.length > 0) {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? flatItems.length - 1 : i - 1));
    } else if (e.key === 'Enter' && flatItems[activeIdx]) {
      e.preventDefault();
      executeItem(flatItems[activeIdx]);
    }
  };

  let runningIdx = 0;

  return (
    <div
      className="cmd-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Busca rápida e comandos"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cmd-modal" onKeyDown={handleKeyDown}>
        <div className="cmd-input-row">
          <span style={{ color: 'var(--text-subtle)', display: 'flex' }}>
            <SearchIcon size={18} />
          </span>
          <input
            ref={inputRef}
            type="text"
            maxLength={40}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar ação (PETR4, Itaú, Vale...) ou escolher atalho..."
            className="cmd-input"
          />
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', display: 'flex', padding: 4 }}
            aria-label="Fechar busca"
          >
            <XIcon size={16} />
          </button>
        </div>

        <div className="cmd-body">
          {query.trim() ? (
            <>
              {loading && (
                <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                  Buscando na B3...
                </div>
              )}
              {!loading && flatItems.length === 0 && (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                  Nenhum ativo encontrado para <strong>“{query}”</strong>.
                </div>
              )}
              {flatItems.map((item, idx) => {
                if (item.type === 'direct') {
                  return (
                    <button
                      key={item.key}
                      className={`cmd-item ${idx === activeIdx ? 'kb-active' : ''}`}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => executeItem(item)}
                    >
                      <span>Abrir análise direta de <strong className="mono">{item.symbol}</strong></span>
                      <span style={{ fontSize: '0.74rem', color: 'var(--brand)', fontWeight: 700 }}>Enter ↵</span>
                    </button>
                  );
                }
                const s = item.stock;
                const isPos = (s.change ?? 0) >= 0;
                return (
                  <button
                    key={item.key}
                    className={`cmd-item ${idx === activeIdx ? 'kb-active' : ''}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => executeItem(item)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                      <StockLogo src={s.logo} symbol={s.symbol} size={28} radius={6} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{s.symbol}</div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280 }}>
                          {s.name}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className="num" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                        R$ {s.price?.toFixed(2).replace('.', ',')}
                      </div>
                      <div className="num" style={{ fontSize: '0.72rem', fontWeight: 700, color: isPos ? 'var(--positive)' : 'var(--negative)' }}>
                        {isPos ? '+' : ''}{s.change?.toFixed(2).replace('.', ',')}%
                      </div>
                    </div>
                  </button>
                );
              })}
            </>
          ) : (
            <>
              {recent.length > 0 && (
                <>
                  <div className="cmd-group-label">Vistos Recentemente</div>
                  {recent.map((sym) => {
                    const idx = runningIdx++;
                    return (
                      <button
                        key={`rec-${sym}`}
                        className={`cmd-item ${idx === activeIdx ? 'kb-active' : ''}`}
                        onMouseEnter={() => setActiveIdx(idx)}
                        onClick={() => executeItem(flatItems[idx])}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
                          <StockLogo src={`https://icons.brapi.dev/icons/${sym}.svg`} symbol={sym} size={24} radius={6} />
                          <strong className="mono">{sym}</strong>
                        </span>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-subtle)' }}>Abrir análise</span>
                      </button>
                    );
                  })}
                </>
              )}

              {watchlist.filter((s) => !recent.includes(s)).slice(0, 4).length > 0 && (
                <>
                  <div className="cmd-group-label">Favoritos</div>
                  {watchlist
                    .filter((s) => !recent.includes(s))
                    .slice(0, 4)
                    .map((sym) => {
                      const idx = runningIdx++;
                      return (
                        <button
                          key={`fav-${sym}`}
                          className={`cmd-item ${idx === activeIdx ? 'kb-active' : ''}`}
                          onMouseEnter={() => setActiveIdx(idx)}
                          onClick={() => executeItem(flatItems[idx])}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem' }}>
                            <span style={{ color: '#f59e0b', display: 'flex' }}><StarIcon size={14} filled /></span>
                            <strong className="mono">{sym}</strong>
                          </span>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-subtle)' }}>Favorito</span>
                        </button>
                      );
                    })}
                </>
              )}

              <div className="cmd-group-label">Atalhos Rápidos</div>
              {quickActions.map((act) => {
                const idx = runningIdx++;
                return (
                  <button
                    key={act.id}
                    className={`cmd-item ${idx === activeIdx ? 'kb-active' : ''}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => executeItem(flatItems[idx])}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ color: 'var(--brand)', display: 'flex' }}>{act.icon}</span>
                      <span>{act.label}</span>
                    </span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-subtle)' }}>↵</span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className="cmd-footer">
          <span>↑↓ navegar · Enter abrir · Esc fechar</span>
          <span className="mono">Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;

