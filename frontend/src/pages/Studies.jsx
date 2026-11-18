import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpenIcon, CheckCircleIcon, ChevronRightIcon, RefreshIcon, StarIcon, ScaleIcon, XIcon } from '../components/Icons';
import StockLogo from '../components/StockLogo';
import ViabilityBadge from '../components/ViabilityBadge';
import { showToast } from '../components/Toast';
import { apiFetch } from '../api';
import { sanitizeTicker } from '../utils/security';

function WatchlistsManager({ navigate }) {
  const [lists, setLists] = React.useState([]);
  const [newListName, setNewListName] = React.useState('');
  const [tickerInputs, setTickerInputs] = React.useState({});

  const loadLists = React.useCallback(() => {
    apiFetch('/api/watchlists')
      .then((d) => setLists(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    loadLists();
  }, [loadLists]);

  const createList = async (e) => {
    e.preventDefault();
    const name = newListName.trim();
    if (name.length < 2) return;
    try {
      await apiFetch('/api/watchlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setNewListName('');
      loadLists();
      showToast(`Lista "${name}" criada!`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const deleteList = async (id, name) => {
    if (!window.confirm(`Remover a lista “${name}” e todos os seus ativos? Esta ação não pode ser desfeita.`)) return;
    try {
      await apiFetch(`/api/watchlists/${id}`, { method: 'DELETE' });
      loadLists();
      showToast(`Lista "${name}" removida.`, 'info');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const addSymbol = async (e, listId) => {
    e.preventDefault();
    const sym = sanitizeTicker(tickerInputs[listId] || '');
    if (!sym) {
      showToast('Ticker inválido (ex: PETR4, MXRF11).', 'error');
      return;
    }
    try {
      await apiFetch(`/api/watchlists/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: sym }),
      });
      setTickerInputs((prev) => ({ ...prev, [listId]: '' }));
      loadLists();
      showToast(`${sym} adicionado à lista!`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const removeSymbol = async (listId, sym) => {
    if (!window.confirm(`Remover ${sym} desta lista?`)) return;
    try {
      await apiFetch(`/api/watchlists/${listId}/items/${encodeURIComponent(sym)}`, { method: 'DELETE' });
      loadLists();
    } catch {}
  };

  return (
    <section style={{ marginBottom: '1.75rem' }}>
      <div className="section-heading">
        <h2 className="section-title">
          <span style={{ color: '#f59e0b', display: 'flex' }}><StarIcon size={18} filled /></span>
          Listas de Acompanhamento
        </h2>
        <form onSubmit={createList} style={{ display: 'flex', gap: '0.45rem' }}>
          <input
            type="text"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="Nova lista (ex: Dividendos, FIIs...)"
            className="field-input"
            style={{ width: 215, padding: '0.42rem 0.65rem', fontSize: '0.82rem' }}
          />
          <button type="submit" className="btn btn-primary" style={{ padding: '0.42rem 0.85rem', fontSize: '0.8rem' }}>
            + Criar Lista
          </button>
        </form>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.95rem' }}>
        {lists.map((list) => (
          <div key={list.id} className="card" style={{ padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <strong style={{ fontSize: '0.94rem', color: 'var(--text-primary)' }}>{list.name}</strong>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                {list.symbols.length >= 2 && (
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem' }}
                    onClick={() => navigate(`/comparar?tickers=${list.symbols.slice(0, 5).join(',')}`)}
                  >
                    <ScaleIcon size={12} /> Comparar
                  </button>
                )}
                {list.id > 1 && (
                  <button
                    onClick={() => deleteList(list.id, list.name)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', display: 'flex' }}
                    title={`Remover lista ${list.name}`}
                    aria-label={`Remover lista ${list.name}`}
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', minHeight: 28 }}>
              {list.symbols.length === 0 ? (
                <span style={{ fontSize: '0.76rem', color: 'var(--text-subtle)' }}>Nenhum ativo nesta lista.</span>
              ) : (
                list.symbols.map((sym) => (
                  <span key={sym} className="pill pill-brand mono" style={{ padding: '0.24rem 0.55rem' }}>
                    <span style={{ cursor: 'pointer' }} onClick={() => navigate(`/acoes/${sym}`)}>{sym}</span>
                    <button
                      onClick={() => removeSymbol(list.id, sym)}
                      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', padding: 0 }}
                      title={`Remover ${sym} da lista`}
                      aria-label={`Remover ${sym} da lista ${list.name}`}
                    >
                      <XIcon size={11} />
                    </button>
                  </span>
                ))
              )}
            </div>

            <form onSubmit={(e) => addSymbol(e, list.id)} style={{ display: 'flex', gap: '0.4rem', marginTop: 'auto' }}>
              <input
                type="text"
                value={tickerInputs[list.id] || ''}
                onChange={(e) => setTickerInputs((prev) => ({ ...prev, [list.id]: e.target.value }))}
                placeholder="Adicionar ticker (ex: PETR4, MXRF11)"
                className="field-input mono"
                style={{ fontSize: '0.78rem', padding: '0.38rem 0.6rem' }}
              />
              <button type="submit" className="btn btn-ghost" style={{ padding: '0.38rem 0.7rem', fontSize: '0.78rem' }}>
                +
              </button>
            </form>
          </div>
        ))}
      </div>
    </section>
  );
}

function fmtBrl(v) {
  if (v == null || isNaN(v)) return '—';
  return `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
}

function Studies() {
  const navigate = useNavigate();
  const [notes, setNotes] = React.useState([]);
  const [stocksMap, setStocksMap] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const loadData = React.useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([apiFetch('/api/notes'), apiFetch('/api/indicators').catch(() => ({ stocks: [] }))])
      .then(([notesList, indData]) => {
        const map = {};
        for (const s of indData.stocks || []) {
          map[s.symbol] = s;
        }
        setStocksMap(map);
        setNotes(Array.isArray(notesList) ? notesList : []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const belowTargetCount = notes.filter((n) => {
    const livePrice = stocksMap[n.symbol]?.price;
    return livePrice && n.target_price && livePrice <= n.target_price;
  }).length;

  const avgProgress = notes.length
    ? Math.round(
        notes.reduce((acc, n) => {
          const total = n.checklist?.length || 0;
          if (!total) return acc;
          const done = n.checklist.filter((c) => c.done).length;
          return acc + (done / total) * 100;
        }, 0) / notes.length
      )
    : 0;

  return (
    <div>
      <div style={styles.headerRow}>
        <div>
          <span className="page-eyebrow">Acompanhamento Pessoal</span>
          <h1 style={styles.title}>
            <span style={{ color: 'var(--brand)', display: 'inline-flex' }}><BookOpenIcon size={22} /></span>
            Meus Estudos & Teses
          </h1>
          <p style={styles.subtitle}>
            Organize suas listas de acompanhamento e compare seu preço-alvo pessoal com a cotação atual de cada empresa.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={loadData}>
          <RefreshIcon size={14} /> Atualizar
        </button>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>Falha ao carregar seus estudos: {error}</span>
          <button className="btn btn-primary" onClick={loadData}>Tentar novamente</button>
        </div>
      )}

      {/* Multiple SQLite Watchlists */}
      <WatchlistsManager navigate={navigate} />

      {/* Summary Metrics */}
      <div style={styles.statsGrid}>
        <div className="card" style={styles.statCard}>
          <span style={styles.statLabel}>Teses Salvas</span>
          <strong className="num" style={styles.statVal}>{notes.length}</strong>
        </div>
        <div className="card" style={styles.statCard}>
          <span style={styles.statLabel}>Abaixo do Preço-Alvo</span>
          <strong className="num" style={{ ...styles.statVal, color: 'var(--positive)' }}>{belowTargetCount}</strong>
        </div>
        <div className="card" style={styles.statCard}>
          <span style={styles.statLabel}>Progresso Médio Checklist</span>
          <strong className="num" style={{ ...styles.statVal, color: 'var(--brand)' }}>{avgProgress}%</strong>
        </div>
      </div>

      {loading ? (
        <div style={styles.cardsGrid}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="card" style={{ padding: '1.25rem' }}>
              <div className="skeleton" style={{ height: 36, width: '60%', marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 54, width: '100%', marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 10, width: '80%' }} />
            </div>
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="card" style={styles.emptyCard}>
          <h2 style={{ margin: '0 0 0.45rem 0', fontSize: '1.15rem' }}>Nenhuma tese registrada ainda</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: 480, margin: '0 auto 1.25rem' }}>
            Abra qualquer ação, clique na aba <strong>Caderno de Tese</strong> e salve sua análise, riscos, preço-alvo e checklist. Tudo aparecerá organizado aqui!
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            {['PETR4', 'VALE3', 'ITUB4', 'BBAS3', 'WEGE3'].map((sym) => (
              <button
                key={sym}
                className="btn btn-primary mono"
                onClick={() => navigate(`/acoes/${sym}?tab=tese`)}
              >
                Estudar {sym} →
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={styles.cardsGrid}>
          {notes.map((n) => {
            const info = stocksMap[n.symbol];
            const livePrice = info?.price;
            const margin =
              livePrice && n.target_price
                ? ((n.target_price - livePrice) / livePrice) * 100
                : null;
            const totalChecks = n.checklist?.length || 0;
            const doneChecks = (n.checklist || []).filter((c) => c.done).length;
            const checkPct = totalChecks > 0 ? Math.round((doneChecks / totalChecks) * 100) : 0;

            return (
              <div
                key={n.symbol}
                className="card card-interactive"
                style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/acoes/${n.symbol}?tab=tese`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/acoes/${n.symbol}?tab=tese`);
                  }
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                    <StockLogo
                      src={info?.logo || `https://icons.brapi.dev/icons/${n.symbol}.svg`}
                      symbol={n.symbol}
                      size={38}
                      radius={9}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{n.symbol}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {info?.name || 'Ativo B3'}
                      </div>
                    </div>
                  </div>
                  {info?.viability && <ViabilityBadge viability={info.viability} />}
                </div>

                {/* Live Price vs Personal Target */}
                <div style={styles.priceBox}>
                  <div>
                    <div style={styles.microLabel}>Cotação Atual</div>
                    <strong className="num" style={{ fontSize: '0.96rem' }}>{fmtBrl(livePrice)}</strong>
                  </div>
                  <div>
                    <div style={styles.microLabel}>Seu Preço-Alvo</div>
                    <strong className="num" style={{ fontSize: '0.96rem', color: 'var(--brand)' }}>{fmtBrl(n.target_price)}</strong>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={styles.microLabel}>Margem</div>
                    {margin != null ? (
                      <span className={`pill num ${margin >= 0 ? 'pill-pos' : 'pill-neg'}`}>
                        {margin >= 0 ? '+' : ''}{margin.toFixed(1).replace('.', ',')}%
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-subtle)', fontSize: '0.8rem' }}>—</span>
                    )}
                  </div>
                </div>

                {/* Thesis excerpt */}
                <p style={styles.excerpt}>
                  {n.thesis ? n.thesis : <span style={{ fontStyle: 'italic', color: 'var(--text-subtle)' }}>Sem tese escrita ainda.</span>}
                </p>

                {/* Checklist progress */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircleIcon size={13} /> Checklist de estudo
                    </span>
                    <span className="num">{doneChecks}/{totalChecks} ({checkPct}%)</span>
                  </div>
                  <div style={styles.track}>
                    <div style={{ width: `${checkPct}%`, height: '100%', background: '#10b981', borderRadius: 999 }} />
                  </div>
                </div>

                <div style={styles.cardFooter}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
                    {n.updated_at ? `Salvo em ${new Date(n.updated_at).toLocaleDateString('pt-BR')}` : ''}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand)' }}>
                    Editar tese <ChevronRightIcon size={14} />
                  </span>
                </div>
              </div>
            );
          })}
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
    marginBottom: '1.25rem',
  },
  title: {
    margin: '0 0 0.25rem 0',
    fontSize: '1.45rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  subtitle: { margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '0.9rem',
    marginBottom: '1.4rem',
  },
  statCard: {
    padding: '1rem 1.15rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  statLabel: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  statVal: { fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' },
  emptyCard: { padding: '3rem 1.5rem', textAlign: 'center' },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
    gap: '1.1rem',
  },
  priceBox: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '0.5rem',
    padding: '0.65rem 0.75rem',
    background: 'var(--bg-surface-subtle)',
    borderRadius: '9px',
    border: '1px solid var(--border-subtle)',
    alignItems: 'center',
  },
  microLabel: { fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-subtle)', marginBottom: 2 },
  excerpt: {
    margin: 0,
    fontSize: '0.83rem',
    lineHeight: 1.5,
    color: 'var(--text-secondary)',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    minHeight: '3.7em',
  },
  track: { height: 6, background: 'var(--border-subtle)', borderRadius: 999, overflow: 'hidden' },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid var(--border-subtle)',
    paddingTop: '0.7rem',
  },
};

export default Studies;

