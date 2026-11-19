import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChartIcon,
  CheckCircleIcon,
  RefreshIcon,
  ScaleIcon,
  XIcon,
} from '../components/Icons';
import StockLogo from '../components/StockLogo';
import { showToast } from '../components/Toast';
import { apiFetch } from '../api';
import { escapeCsvCell, sanitizeTicker } from '../utils/security';

const SECTOR_COLORS = ['#0f766e', '#059669', '#0284c7', '#d97706', '#475569', '#db2777', '#64748b'];

function SectorDonut({ sectors = [] }) {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let cumulativePct = 0;

  return (
    <div style={{ position: 'relative', width: 148, height: 148, flexShrink: 0 }}>
      <svg width="148" height="148" viewBox="0 0 148 148" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx="74" cy="74" r={radius} fill="none" stroke="var(--border-subtle)" strokeWidth="18" />
        {sectors.map((s, idx) => {
          const pct = Math.max(0, Math.min(100, s.pct));
          const dashLen = (pct / 100) * circumference;
          const dashOffset = -(cumulativePct / 100) * circumference;
          cumulativePct += pct;
          return (
            <circle
              key={s.sector}
              cx="74"
              cy="74"
              r={radius}
              fill="none"
              stroke={SECTOR_COLORS[idx % SECTOR_COLORS.length]}
              strokeWidth="18"
              strokeDasharray={`${Math.max(0, dashLen - 1.5)} ${circumference}`}
              strokeDashoffset={dashOffset}
            />
          );
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        <span className="num" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
          {sectors.length}
        </span>
        <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {sectors.length === 1 ? 'Setor' : 'Setores'}
        </span>
      </div>
    </div>
  );
}

function fmtBrl(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${Number(v).toFixed(2).replace('.', ',')}%`;
}

function Portfolio() {
  const navigate = useNavigate();
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  // Add form state
  const [symbol, setSymbol] = React.useState('');
  const [quantity, setQuantity] = React.useState('');
  const [avgPrice, setAvgPrice] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  // Inline edit & safe delete confirmation state
  const [editingId, setEditingId] = React.useState(null);
  const [editQty, setEditQty] = React.useState('');
  const [editAvg, setEditAvg] = React.useState('');
  const [confirmDeleteId, setConfirmDeleteId] = React.useState(null);

  // UX controls: privacy mode, search, type filter & sorting
  const [hideValues, setHideValues] = React.useState(() => {
    try {
      return localStorage.getItem('investanalytics_hide_values') === '1';
    } catch {
      return false;
    }
  });
  const [searchTerm, setSearchTerm] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [sortBy, setSortBy] = React.useState('value_desc');

  const toggleHideValues = () => {
    setHideValues((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('investanalytics_hide_values', next ? '1' : '0');
      } catch {}
      return next;
    });
  };

  const displayBrl = (v) => (hideValues ? 'R$ •••••' : fmtBrl(v));
  const previewTotal = React.useMemo(() => {
    const q = Number(quantity);
    const p = Number(avgPrice);
    if (Number.isFinite(q) && q > 0 && Number.isFinite(p) && p > 0) {
      return q * p;
    }
    return null;
  }, [quantity, avgPrice]);

  const loadPortfolio = React.useCallback(() => {
    setLoading(true);
    setError(null);
    apiFetch('/api/investments/summary')
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const cleanSym = sanitizeTicker(symbol);
    const qtyNum = parseInt(quantity, 10);
    const priceNum = parseFloat(String(avgPrice).replace(',', '.'));

    if (!cleanSym) {
      showToast('Informe um ticker válido da B3 (ex: PETR4, ITUB4, MXRF11).', 'error');
      return;
    }
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
      showToast('Informe uma quantidade inteira positiva.', 'error');
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      showToast('Informe um preço médio válido em reais.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const saved = await apiFetch('/api/investments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: cleanSym,
          quantity: qtyNum,
          avg_price: priceNum,
          consolidate: true,
        }),
      });
      setSymbol('');
      setQuantity('');
      setAvgPrice('');
      showToast(
        saved.consolidated
          ? `Aporte em ${cleanSym} consolidado! Novo preço médio: ${fmtBrl(saved.avg_price)}.`
          : `${cleanSym} adicionado à sua carteira.`,
        'success'
      );
      loadPortfolio();
    } catch (err) {
      showToast(err.message || 'Não foi possível salvar a posição.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (pos) => {
    setEditingId(pos.id);
    setEditQty(String(pos.quantity));
    setEditAvg(String(pos.avg_price));
  };

  const saveEdit = async (id, sym) => {
    const qtyNum = parseInt(editQty, 10);
    const priceNum = parseFloat(String(editAvg).replace(',', '.'));
    if (!Number.isInteger(qtyNum) || qtyNum <= 0 || !Number.isFinite(priceNum) || priceNum <= 0) {
      showToast('Quantidade ou preço médio inválido.', 'error');
      return;
    }
    try {
      await apiFetch(`/api/investments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: qtyNum, avg_price: priceNum }),
      });
      setEditingId(null);
      showToast(`Posição de ${sym} atualizada.`, 'success');
      loadPortfolio();
    } catch (err) {
      showToast(err.message || 'Falha ao atualizar posição.', 'error');
    }
  };

  const handleDelete = async (id, sym) => {
    try {
      await apiFetch(`/api/investments/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      showToast(`${sym} removido da carteira.`, 'info');
      loadPortfolio();
    } catch (err) {
      showToast(err.message || 'Falha ao remover posição.', 'error');
    }
  };

  const positions = data?.positions || [];
  const summary = data?.summary || {};
  const bySector = data?.bySector || [];

  const exportCsv = () => {
    if (positions.length === 0) return;
    const headers = ['Ticker', 'Empresa', 'Setor', 'Quantidade', 'PrecoMedio', 'CotacaoAtual', 'TotalInvestido', 'PatrimonioAtual', 'ResultadoR$', 'Resultado%', 'DY%', 'DivAnualEst'];
    const rows = positions.map((p) =>
      [
        p.symbol,
        p.name,
        p.sector,
        p.quantity,
        p.avg_price,
        p.current_price ?? '',
        p.total_cost,
        p.current_value ?? '',
        p.profit_loss ?? '',
        p.profit_loss_pct ?? '',
        p.dy ?? '',
        p.estimated_annual_dividend ?? '',
      ].map(escapeCsvCell)
    );
    const csv = [headers.map(escapeCsvCell).join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `minha-carteira-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Carteira exportada em CSV (${positions.length} ativos).`, 'success');
  };

  const profitPositive = (summary.totalProfitLoss ?? 0) >= 0;

  return (
    <div>
      <div style={styles.headerRow}>
        <div>
          <span className="page-eyebrow">Acompanhamento Patrimonial</span>
          <h1 style={styles.title}>
            Minha Carteira
          </h1>
          <p style={styles.subtitle}>
            Registre suas posições e acompanhe preço médio, resultado frente à cotação atual, alocação por setor e renda estimada em dividendos.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {positions.length >= 2 && (
            <button
              className="btn btn-primary"
              onClick={() => navigate(`/comparar?tickers=${positions.slice(0, 5).map((p) => p.symbol).join(',')}`)}
              style={{ fontSize: '0.8rem' }}
            >
              <ScaleIcon size={14} /> Comparar carteira
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={exportCsv}
            disabled={positions.length === 0}
            style={{ fontSize: '0.8rem' }}
          >
            Exportar CSV
          </button>
          <button
            type="button"
            className="btn btn-ghost no-print"
            onClick={() => window.print()}
            disabled={positions.length === 0}
            style={{ fontSize: '0.8rem' }}
            title="Imprimir ou salvar resumo da carteira em PDF"
          >
            Imprimir / PDF
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={toggleHideValues}
            aria-pressed={hideValues}
            style={{ fontSize: '0.8rem' }}
            title={hideValues ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros'}
          >
            {hideValues ? 'Mostrar R$' : 'Ocultar R$'}
          </button>
          <button className="btn btn-ghost" onClick={loadPortfolio} style={{ fontSize: '0.8rem' }}>
            <RefreshIcon size={14} /> Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>Não foi possível carregar sua carteira: {error}</span>
          <button className="btn btn-primary" onClick={loadPortfolio}>Tentar novamente</button>
        </div>
      )}

      {/* Executive KPI Strip */}
      <div style={styles.kpiGrid}>
        <div className="card" style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Patrimônio Atual</span>
          <strong className="num" style={styles.kpiValue}>
            {loading ? '—' : displayBrl(summary.totalValue ?? summary.totalCost)}
          </strong>
          <span style={styles.kpiSub}>
            {summary.assetCount || 0} {(summary.assetCount || 0) === 1 ? 'ativo na carteira' : 'ativos na carteira'}
          </span>
        </div>

        <div className="card" style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Total Investido</span>
          <strong className="num" style={styles.kpiValue}>
            {loading ? '—' : displayBrl(summary.totalCost)}
          </strong>
          <span style={styles.kpiSub}>Custo acumulado dos aportes</span>
        </div>

        <div className="card" style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Resultado Acumulado</span>
          <strong
            className="num"
            style={{
              ...styles.kpiValue,
              color:
                summary.totalProfitLoss == null
                  ? 'var(--text-primary)'
                  : profitPositive
                  ? 'var(--positive)'
                  : 'var(--negative)',
            }}
          >
            {loading ? '—' : displayBrl(summary.totalProfitLoss)}
          </strong>
          <span
            className="num"
            style={{
              ...styles.kpiSub,
              fontWeight: 700,
              color:
                summary.totalProfitLossPct == null
                  ? 'var(--text-subtle)'
                  : profitPositive
                  ? 'var(--positive)'
                  : 'var(--negative)',
            }}
          >
            {summary.totalProfitLossPct != null ? fmtPct(summary.totalProfitLossPct) : 'Sem cotação comparável'}
          </span>
        </div>

        <div className="card" style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Dividendos Estimados</span>
          <strong className="num" style={{ ...styles.kpiValue, color: 'var(--positive)' }}>
            {loading ? '—' : displayBrl(summary.estimatedAnnualDividends)}
          </strong>
          <span style={styles.kpiSub}>
            ~{displayBrl(summary.estimatedMonthlyDividends)} / mês (base DY 12m)
          </span>
        </div>
      </div>

      {/* Add Position Form */}
      <form onSubmit={handleAdd} className="card" style={styles.formCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <div>
            <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>
              Registrar Aporte ou Nova Posição
            </strong>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              Se o ativo já existir na carteira, o preço médio é recalculado automaticamente.
            </div>
          </div>
          {previewTotal != null && (
            <span className="pf-preview-chip num">
              Total do aporte: <strong>{fmtBrl(previewTotal)}</strong>
            </span>
          )}
        </div>
        <div style={styles.formGrid}>
          <div style={styles.field}>
            <label htmlFor="pf-symbol" style={styles.label}>Ticker</label>
            <input
              id="pf-symbol"
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="Ex: PETR4, MXRF11"
              className="field-input mono"
              required
            />
          </div>
          <div style={styles.field}>
            <label htmlFor="pf-qty" style={styles.label}>Quantidade</label>
            <input
              id="pf-qty"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Ex: 100"
              className="field-input mono"
              required
            />
          </div>
          <div style={styles.field}>
            <label htmlFor="pf-avg" style={styles.label}>Preço Médio (R$)</label>
            <input
              id="pf-avg"
              type="number"
              min="0.01"
              step="0.01"
              value={avgPrice}
              onChange={(e) => setAvgPrice(e.target.value)}
              placeholder="Ex: 34.50"
              className="field-input mono"
              required
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%', justifyContent: 'center' }}>
              <CheckCircleIcon size={15} />
              {submitting ? 'Salvando...' : 'Adicionar Aporte'}
            </button>
          </div>
        </div>
      </form>

      {/* Sector Allocation (Donut + Horizontal Bars) */}
      {!loading && bySector.length > 0 && (
        <div className="card" style={{ padding: '1.25rem 1.35rem', marginBottom: '1.25rem' }}>
          <h2 className="section-title" style={{ fontSize: '0.96rem', marginBottom: '1rem' }}>
            <span style={{ color: 'var(--text-muted)', display: 'flex' }}><BarChartIcon size={16} /></span>
            Alocação por Setor
          </h2>
          <div className="portfolio-alloc-grid">
            <SectorDonut sectors={bySector} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {bySector.map((s, idx) => {
                const color = SECTOR_COLORS[idx % SECTOR_COLORS.length];
                return (
                  <div key={s.sector}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4, gap: '0.5rem' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 0 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.sector}</span>
                      </span>
                      <span className="num" style={{ color: 'var(--text-primary)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {displayBrl(s.value)} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>({s.pct.toFixed(1).replace('.', ',')}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(2, s.pct)}%`, height: '100%', background: color, borderRadius: 999 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Positions Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 44 }} />)}
          </div>
        ) : positions.length === 0 ? (
          <div style={{ padding: '2.75rem 1.5rem', textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 0.4rem 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
              Sua carteira está vazia
            </h2>
            <p style={{ margin: '0 auto 1.15rem', fontSize: '0.86rem', color: 'var(--text-muted)', maxWidth: 480 }}>
              Registre seus primeiros aportes acima para acompanhar patrimônio, rentabilidade e dividendos estimados.
            </p>
            <div style={{ display: 'flex', gap: '0.45rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              {['PETR4', 'ITUB4', 'VALE3', 'MXRF11', 'BOVA11'].map((sym) => (
                <button
                  key={sym}
                  type="button"
                  className="chip-btn mono"
                  onClick={() => setSymbol(sym)}
                >
                  + {sym}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="pf-table-toolbar">
              <div className="pf-filter-pills" role="group" aria-label="Filtrar por tipo de ativo">
                {[
                  { id: 'all', label: `Todos (${positions.length})` },
                  { id: 'stock', label: 'Ações' },
                  { id: 'fii', label: 'FIIs' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`pf-pill ${typeFilter === opt.id ? 'active' : ''}`}
                    onClick={() => setTypeFilter(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="pf-toolbar-controls">
                <input
                  type="search"
                  className="field-input"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filtrar ticker ou setor..."
                  aria-label="Filtrar posições por ticker ou setor"
                  style={{ minWidth: 190, height: 34, fontSize: '0.8rem' }}
                />
                <select
                  className="field-input"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  aria-label="Ordenar posições"
                  style={{ height: 34, fontSize: '0.8rem', minWidth: 155 }}
                >
                  <option value="value_desc">Maior valor atual</option>
                  <option value="profit_desc">Maior retorno (%)</option>
                  <option value="symbol_asc">Ticker (A–Z)</option>
                </select>
              </div>
            </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: '880px' }}>
              <thead>
                <tr>
                  <th className="sticky-col" style={{ minWidth: 195 }}>Ativo</th>
                  <th style={{ textAlign: 'right' }}>Qtd.</th>
                  <th style={{ textAlign: 'right' }}>Preço Médio</th>
                  <th style={{ textAlign: 'right' }}>Cotação</th>
                  <th style={{ textAlign: 'right' }}>Investido</th>
                  <th style={{ textAlign: 'right' }}>Atual</th>
                  <th style={{ textAlign: 'right' }}>Resultado</th>
                  <th style={{ textAlign: 'right' }}>Div. Est. (Ano)</th>
                  <th style={{ textAlign: 'center', width: 120 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {[...positions]
                  .filter((p) => {
                    if (typeFilter === 'stock' && p.asset_type === 'fii') return false;
                    if (typeFilter === 'fii' && p.asset_type !== 'fii') return false;
                    if (searchTerm.trim()) {
                      const q = searchTerm.trim().toLowerCase();
                      return (
                        String(p.symbol || '').toLowerCase().includes(q) ||
                        String(p.name || '').toLowerCase().includes(q) ||
                        String(p.sector || '').toLowerCase().includes(q)
                      );
                    }
                    return true;
                  })
                  .sort((a, b) => {
                    if (sortBy === 'profit_desc') return (b.profit_loss_pct ?? -Infinity) - (a.profit_loss_pct ?? -Infinity);
                    if (sortBy === 'symbol_asc') return String(a.symbol).localeCompare(String(b.symbol));
                    return (b.current_value ?? b.total_cost ?? 0) - (a.current_value ?? a.total_cost ?? 0);
                  })
                  .map((p) => {
                  const isEditing = editingId === p.id;
                  const isGain = (p.profit_loss ?? 0) >= 0;
                  return (
                    <tr key={p.id}>
                      <td className="sticky-col">
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}
                          role="button"
                          tabIndex={0}
                          onClick={() => navigate(`/acoes/${p.symbol}`)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              navigate(`/acoes/${p.symbol}`);
                            }
                          }}
                        >
                          <StockLogo src={p.logo} symbol={p.symbol} size={32} radius={8} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.symbol}</div>
                            <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 130 }}>
                              {p.sector}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>
                        {isEditing ? (
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            aria-label={`Editar quantidade de ${p.symbol}`}
                            className="field-input mono"
                            style={{ width: 82, padding: '0.28rem 0.45rem', textAlign: 'right' }}
                          />
                        ) : (
                          p.quantity.toLocaleString('pt-BR')
                        )}
                      </td>

                      <td className="num" style={{ textAlign: 'right' }}>
                        {isEditing ? (
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={editAvg}
                            onChange={(e) => setEditAvg(e.target.value)}
                            aria-label={`Editar preço médio de ${p.symbol}`}
                            className="field-input mono"
                            style={{ width: 92, padding: '0.28rem 0.45rem', textAlign: 'right' }}
                          />
                        ) : (
                          fmtBrl(p.avg_price)
                        )}
                      </td>

                      <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>
                        {fmtBrl(p.current_price)}
                      </td>

                      <td className="num" style={{ textAlign: 'right' }}>{fmtBrl(p.total_cost)}</td>

                      <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>
                        {fmtBrl(p.current_value)}
                      </td>

                      <td className="num" style={{ textAlign: 'right' }}>
                        {p.profit_loss != null ? (
                          <div>
                            <div style={{ fontWeight: 700, color: isGain ? 'var(--positive)' : 'var(--negative)' }}>
                              {fmtBrl(p.profit_loss)}
                            </div>
                            <div style={{ fontSize: '0.71rem', fontWeight: 700, color: isGain ? 'var(--positive)' : 'var(--negative)' }}>
                              {fmtPct(p.profit_loss_pct)}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-subtle)' }}>—</span>
                        )}
                      </td>

                      <td className="num" style={{ textAlign: 'right', color: p.estimated_annual_dividend ? 'var(--positive)' : 'var(--text-subtle)', fontWeight: 600 }}>
                        {fmtBrl(p.estimated_annual_dividend)}
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-emerald"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                                onClick={() => saveEdit(p.id, p.symbol)}
                              >
                                Salvar
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ padding: '0.25rem 0.45rem', fontSize: '0.72rem' }}
                                onClick={() => setEditingId(null)}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : confirmDeleteId === p.id ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-danger-soft"
                                style={{ padding: '0.25rem 0.52rem', fontSize: '0.72rem' }}
                                onClick={() => handleDelete(p.id, p.symbol)}
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ padding: '0.25rem 0.45rem', fontSize: '0.72rem' }}
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                Não
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem' }}
                                onClick={() => {
                                  setConfirmDeleteId(null);
                                  startEdit(p);
                                }}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(p.id)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', display: 'flex', padding: '0.25rem' }}
                                title={`Remover ${p.symbol}`}
                                aria-label={`Remover ${p.symbol} da carteira`}
                              >
                                <XIcon size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <p style={{ marginTop: '0.9rem', fontSize: '0.75rem', color: 'var(--text-subtle)', textAlign: 'center' }}>
        Carteira de estudos salva localmente. Valores estimados de dividendos baseiam-se no Dividend Yield dos últimos 12 meses e não representam garantia de pagamento futuro.
      </p>
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
    marginBottom: '1.15rem',
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
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '0.85rem',
    marginBottom: '1.25rem',
  },
  kpiCard: {
    padding: '0.95rem 1.1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  kpiLabel: {
    fontSize: '0.68rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
  },
  kpiValue: { fontSize: '1.38rem', fontWeight: 800, color: 'var(--text-primary)' },
  kpiSub: { fontSize: '0.73rem', color: 'var(--text-subtle)' },
  formCard: { padding: '1.15rem 1.25rem', marginBottom: '1.25rem' },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
    gap: '0.85rem',
  },
  field: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  label: {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
};

export default Portfolio;

