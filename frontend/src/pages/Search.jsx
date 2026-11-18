import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchIcon, StarIcon, ChevronRightIcon } from '../components/Icons';
import { useWatchlist } from '../hooks/useWatchlist';
import { apiFetch } from '../api';
import StockLogo from '../components/StockLogo';

function Search() {
  const navigate = useNavigate();
  const { isStarred, toggle } = useWatchlist();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      apiFetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((json) => {
          setResults(json.results || []);
          setSearched(true);
          setLoading(false);
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          setError(err.message);
          setLoading(false);
        });
    }, 260);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const suggestedTerms = ['PETR4', 'ITUB', 'VALE', 'WEGE', 'BBAS', 'Finance', 'Energy'];

  return (
    <div style={{ maxWidth: '880px', margin: '0 auto' }}>
      <span className="page-eyebrow">Pesquisa de Ativos · B3</span>
      <h1 style={styles.title}>
        <span style={{ color: 'var(--brand)', display: 'inline-flex' }}><SearchIcon size={22} /></span>
        Explorar Ativos da B3
      </h1>
      <p style={styles.subtitle}>
        Pesquise em tempo real por ticker, nome da empresa ou setor econômico.
      </p>

      <div style={{ position: 'relative', marginBottom: '0.85rem' }}>
        <span style={styles.searchIcon}>
          <SearchIcon size={18} />
        </span>
        <input
          type="text"
          autoFocus
          aria-label="Buscar ativos da B3"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Digite o ticker, empresa ou setor (ex: PETR4, Itaú, Vale, Energy...)"
          className="field-input"
          style={{ padding: '0.9rem 1rem 0.9rem 2.8rem', fontSize: '0.98rem', borderRadius: '12px' }}
        />
      </div>

      {!query && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Sugestões:</span>
          {suggestedTerms.map((t) => (
            <button key={t} className="chip-btn" onClick={() => setQuery(t)}>
              {t}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="error-banner" role="alert">
          <span>Não foi possível concluir a busca agora. {error}</span>
        </div>
      )}

      {loading && (
        <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 48, width: '100%' }} />
          ))}
        </div>
      )}

      {!loading && searched && !error && results.length === 0 && (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Nenhum ativo encontrado para <strong>“{query}”</strong>.
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {results.map((item) => {
            const isPos = (item.change ?? 0) >= 0;
            const starred = isStarred(item.symbol);
            return (
              <div
                key={item.symbol}
                className="ranking-row"
                role="button"
                tabIndex={0}
                style={{ padding: '0.85rem 1.15rem' }}
                onClick={() => navigate(`/acoes/${item.symbol}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/acoes/${item.symbol}`);
                  }
                }}
              >
                <StockLogo src={item.logo} symbol={item.symbol} size={38} radius={9} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.96rem' }}>{item.symbol}</strong>
                    {item.hasFundamentals && (
                      <span className="pill pill-pos" style={{ fontSize: '0.68rem' }}>
                        Análise completa
                      </span>
                    )}
                  </div>
                  <div style={styles.name}>{item.name}</div>
                  {item.sector && <div style={styles.sector}>{item.sector}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="num" style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.94rem' }}>
                    R$ {item.price != null ? item.price.toFixed(2).replace('.', ',') : '—'}
                  </div>
                  {item.change != null && (
                    <div className="num" style={{ fontSize: '0.78rem', fontWeight: 700, color: isPos ? 'var(--positive)' : 'var(--negative)' }}>
                      {isPos ? '▲ +' : '▼ '}{item.change.toFixed(2).replace('.', ',')}%
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={`star-btn ${starred ? 'starred' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(item.symbol);
                  }}
                  title={starred ? 'Remover favorito' : 'Favoritar'}
                  aria-label={starred ? `Remover ${item.symbol} dos favoritos` : `Adicionar ${item.symbol} aos favoritos`}
                  aria-pressed={starred}
                >
                  <StarIcon size={16} filled={starred} />
                </button>
                <span style={{ color: 'var(--text-subtle)', display: 'flex' }}>
                  <ChevronRightIcon size={16} />
                </span>
              </div>
            );
          })}
        </div>
      )}
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
  subtitle: { margin: '0 0 1.25rem 0', fontSize: '0.88rem', color: 'var(--text-muted)' },
  searchIcon: {
    position: 'absolute',
    left: '0.95rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-subtle)',
    display: 'flex',
    pointerEvents: 'none',
  },
  name: { fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  sector: { fontSize: '0.72rem', color: 'var(--text-subtle)' },
};

export default Search;
