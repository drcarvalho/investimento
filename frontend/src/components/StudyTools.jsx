import React from 'react';
import { apiFetch } from '../api';
import { showToast } from './Toast';
import { CalculatorIcon, BookOpenIcon, CheckCircleIcon, XIcon } from './Icons';

function fmtBrl(v) {
  return `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtShort(v) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace('.', ',')}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
  return `${Math.round(v)}`;
}

export function DividendSimulator({ symbol, price, dividendYield }) {
  const [initialAmount, setInitialAmount] = React.useState(5000);
  const [monthlyAmount, setMonthlyAmount] = React.useState(500);
  const [years, setYears] = React.useState(10);
  const [hoveredYear, setHoveredYear] = React.useState(null);

  const safePrice = price > 0 ? price : 1;
  const dy = dividendYield > 0 ? dividendYield : 6;
  const initNum = Math.max(0, Number(initialAmount) || 0);
  const monthNum = Math.max(0, Number(monthlyAmount) || 0);
  const yearsClamped = Math.min(35, Math.max(1, Number(years) || 1));

  const sharesNow = Math.floor(initNum / safePrice);
  const annualDivNow = sharesNow * safePrice * (dy / 100);
  const monthlyDivNow = annualDivNow / 12;

  const monthlyRate = Math.pow(1 + dy / 100, 1 / 12) - 1;
  const yearlySeries = [];
  let balance = initNum;
  let contributed = initNum;

  for (let y = 1; y <= yearsClamped; y++) {
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + monthlyRate) + monthNum;
      contributed += monthNum;
    }
    yearlySeries.push({
      year: y,
      contributed,
      earnings: Math.max(0, balance - contributed),
      total: balance,
      monthlyDiv: (balance * (dy / 100)) / 12,
    });
  }

  const finalPoint = yearlySeries[yearlySeries.length - 1] || { contributed: initNum, earnings: 0, total: initNum, monthlyDiv: monthlyDivNow };
  const maxTotal = Math.max(finalPoint.total, 1);
  const activeYear = hoveredYear != null ? yearlySeries[hoveredYear] : null;

  return (
    <div className="card" style={{ padding: '1.35rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
        <span style={{ color: 'var(--brand)', display: 'flex' }}><CalculatorIcon size={18} /></span>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Simulador de Dividendos & Juros Compostos ({symbol})
        </h3>
      </div>
      <p style={{ margin: '0 0 1.1rem 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
        Baseado na cotação atual ({fmtBrl(price)}) e DY estimado de{' '}
        <strong className="num">{dy.toFixed(2).replace('.', ',')}% a.a.</strong> (reinvestindo proventos).
      </p>

      <div style={styles.simGrid}>
        <div style={styles.field}>
          <label style={styles.label}>Aporte Inicial (R$)</label>
          <input type="number" min="0" step="500" value={initialAmount} onChange={(e) => setInitialAmount(e.target.value)} className="field-input mono" />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Aporte Mensal (R$)</label>
          <input type="number" min="0" step="100" value={monthlyAmount} onChange={(e) => setMonthlyAmount(e.target.value)} className="field-input mono" />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Prazo (Anos)</label>
          <input type="number" min="1" max="35" value={years} onChange={(e) => setYears(e.target.value)} className="field-input mono" />
        </div>
      </div>

      <div style={styles.resultGrid}>
        <div style={styles.resultBox}>
          <span style={styles.resLabel}>Ações compradas hoje</span>
          <strong className="num" style={styles.resVal}>{sharesNow.toLocaleString('pt-BR')} un.</strong>
          <span style={styles.resSub}>Renda hoje: ~{fmtBrl(monthlyDivNow)}/mês</span>
        </div>
        <div style={styles.resultBox}>
          <span style={styles.resLabel}>Total aportado ({yearsClamped}a)</span>
          <strong className="num" style={styles.resVal}>{fmtBrl(finalPoint.contributed)}</strong>
          <span style={styles.resSub}>Aportes do seu bolso</span>
        </div>
        <div style={styles.resultBox}>
          <span style={styles.resLabel}>Dividendos reinvestidos</span>
          <strong className="num" style={{ ...styles.resVal, color: '#10b981' }}>
            +{fmtBrl(finalPoint.earnings)}
          </strong>
          <span style={styles.resSub}>Efeito bola de neve</span>
        </div>
        <div style={{ ...styles.resultBox, borderColor: 'var(--positive)' }}>
          <span style={styles.resLabel}>Patrimônio projetado</span>
          <strong className="num" style={{ ...styles.resVal, color: 'var(--positive)' }}>
            {fmtBrl(finalPoint.total)}
          </strong>
          <span style={styles.resSub}>Renda: ~{fmtBrl(finalPoint.monthlyDiv)}/mês</span>
        </div>
      </div>

      {/* Stacked Year-by-Year Evolution Chart */}
      <div style={styles.chartBox}>
        <div style={styles.chartHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', fontSize: '0.76rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600, color: 'var(--text-secondary)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#0f766e' }} />
              Aportado
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600, color: 'var(--text-secondary)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#10b981' }} />
              Dividendos Reinvestidos
            </span>
          </div>
          {activeYear ? (
            <div className="num" style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 700 }}>
              Ano {activeYear.year}: {fmtBrl(activeYear.total)} (~{fmtBrl(activeYear.monthlyDiv)}/mês)
            </div>
          ) : (
            <div style={{ fontSize: '0.74rem', color: 'var(--text-subtle)' }}>
              Passe o mouse nas barras para ver cada ano
            </div>
          )}
        </div>

        <div style={styles.barsContainer}>
          {yearlySeries.map((pt, idx) => {
            const totalPct = (pt.total / maxTotal) * 100;
            const contribPct = pt.total > 0 ? (pt.contributed / pt.total) * 100 : 100;
            const earnPct = 100 - contribPct;
            const isHovered = hoveredYear === idx;
            return (
              <div
                key={pt.year}
                style={styles.barCol}
                onMouseEnter={() => setHoveredYear(idx)}
                onMouseLeave={() => setHoveredYear(null)}
              >
                <div style={styles.barTrack}>
                  <div
                    style={{
                      width: '100%',
                      height: `${Math.max(4, totalPct)}%`,
                      borderRadius: '4px 4px 0 0',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      opacity: hoveredYear == null || isHovered ? 1 : 0.45,
                      transition: 'opacity 0.15s ease',
                    }}
                  >
                    <div style={{ height: `${earnPct}%`, background: '#10b981' }} />
                    <div style={{ height: `${contribPct}%`, background: '#0f766e' }} />
                  </div>
                </div>
                {(yearsClamped <= 15 || pt.year === 1 || pt.year === yearsClamped || pt.year % 5 === 0) && (
                  <span className="mono" style={{ fontSize: '0.66rem', color: 'var(--text-subtle)' }}>
                    {pt.year}a
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-subtle)', marginTop: 4 }} className="mono">
          <span>Ano 1: R$ {fmtShort(yearlySeries[0]?.total || 0)}</span>
          <span>Ano {yearsClamped}: R$ {fmtShort(finalPoint.total)}</span>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_CHECKLIST = [
  'Li o último release de resultados / RI',
  'Entendo como a empresa gera receita',
  'Avaliei o endividamento e concorrência',
  'Defini meu preço-teto / margem de segurança',
];

export function StudyNotes({ symbol, currentPrice }) {
  const [thesis, setThesis] = React.useState('');
  const [risks, setRisks] = React.useState('');
  const [targetPrice, setTargetPrice] = React.useState('');
  const [checklist, setChecklist] = React.useState(
    DEFAULT_CHECKLIST.map((text) => ({ text, done: false }))
  );
  const [newItem, setNewItem] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [updatedAt, setUpdatedAt] = React.useState(null);

  React.useEffect(() => {
    const controller = new AbortController();
    apiFetch(`/api/notes/${encodeURIComponent(symbol)}`, { signal: controller.signal })
      .then((data) => {
        setThesis(data.thesis || '');
        setRisks(data.risks || '');
        setTargetPrice(data.target_price != null ? String(data.target_price) : '');
        if (data.checklist && data.checklist.length > 0) {
          setChecklist(data.checklist);
        } else {
          setChecklist(DEFAULT_CHECKLIST.map((text) => ({ text, done: false })));
        }
        setUpdatedAt(data.updated_at || null);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [symbol]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await apiFetch(`/api/notes/${encodeURIComponent(symbol)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thesis,
          risks,
          target_price: targetPrice === '' ? null : Number(targetPrice),
          checklist,
        }),
      });
      setUpdatedAt(saved.updated_at);
      showToast(`Tese de ${symbol} salva com sucesso.`, 'success');
    } catch (err) {
      showToast(`Erro ao salvar anotação: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleCheck = (idx) => {
    setChecklist((prev) => prev.map((it, i) => (i === idx ? { ...it, done: !it.done } : it)));
  };

  const addCheckItem = (e) => {
    e.preventDefault();
    if (!newItem.trim()) return;
    setChecklist((prev) => [...prev, { text: newItem.trim(), done: false }]);
    setNewItem('');
  };

  const removeCheckItem = (idx) => {
    setChecklist((prev) => prev.filter((_, i) => i !== idx));
  };

  const targetNum = parseFloat(targetPrice);
  const marginPct =
    !isNaN(targetNum) && targetNum > 0 && currentPrice > 0
      ? ((targetNum - currentPrice) / currentPrice) * 100
      : null;

  return (
    <div className="card" style={{ padding: '1.35rem' }}>
      <div style={styles.notesHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'var(--brand)', display: 'flex' }}><BookOpenIcon size={18} /></span>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Caderno de Tese & Estudo — {symbol}
          </h3>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <CheckCircleIcon size={15} />
          {saving ? 'Salvando...' : 'Salvar Anotações'}
        </button>
      </div>

      {updatedAt && (
        <div style={{ fontSize: '0.74rem', color: 'var(--text-subtle)', marginBottom: '1rem' }}>
          Última alteração salva em {new Date(updatedAt).toLocaleString('pt-BR')}
        </div>
      )}

      <div style={styles.notesGrid}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div style={styles.field}>
            <label style={styles.label}>Meu Preço-Alvo / Preço-Teto Pessoal (R$)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <input
                type="number"
                step="0.10"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="Ex: 38.00"
                className="field-input mono"
                style={{ maxWidth: 180 }}
              />
              {marginPct != null && (
                <span className={`pill num ${marginPct >= 0 ? 'pill-pos' : 'pill-neg'}`}>
                  {marginPct >= 0 ? 'Margem: +' : 'Acima do alvo: '}
                  {marginPct.toFixed(1).replace('.', ',')}%
                </span>
              )}
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Tese de Investimento (Por que comprar / manter?)</label>
            <textarea
              rows={4}
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              placeholder="Anote vantagens competitivas, histórico de dividendos, governança, catalisadores..."
              className="field-input"
              style={{ resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Principais Riscos & Pontos de Atenção</label>
            <textarea
              rows={3}
              value={risks}
              onChange={(e) => setRisks(e.target.value)}
              placeholder="Risco político, câmbio, commodities, concorrência, endividamento..."
              className="field-input"
              style={{ resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>
        </div>

        <div style={styles.checklistBox}>
          <div style={{ ...styles.label, marginBottom: '0.65rem' }}>Checklist de Estudo</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.85rem' }}>
            {checklist.map((item, idx) => (
              <div key={idx} style={styles.checkRow}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggleCheck(idx)}
                    style={{ accentColor: 'var(--positive-bright)', cursor: 'pointer' }}
                  />
                  <span
                    style={{
                      fontSize: '0.84rem',
                      color: item.done ? 'var(--text-subtle)' : 'var(--text-primary)',
                      textDecoration: item.done ? 'line-through' : 'none',
                    }}
                  >
                    {item.text}
                  </span>
                </label>
                <button
                  onClick={() => removeCheckItem(idx)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', display: 'flex' }}
                  title="Remover item"
                >
                  <XIcon size={13} />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={addCheckItem} style={{ display: 'flex', gap: '0.45rem' }}>
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Adicionar item ao checklist..."
              className="field-input"
              style={{ fontSize: '0.82rem', padding: '0.45rem 0.65rem' }}
            />
            <button type="submit" className="btn btn-ghost" style={{ padding: '0.45rem 0.75rem' }}>
              +
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const styles = {
  simGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: '0.85rem',
    marginBottom: '1rem',
  },
  field: { display: 'flex', flexDirection: 'column', gap: '0.32rem' },
  label: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  resultGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
    gap: '0.85rem',
    marginBottom: '1.25rem',
  },
  resultBox: {
    background: 'var(--bg-surface-subtle)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '10px',
    padding: '0.9rem 1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  resLabel: { fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' },
  resVal: { fontSize: '1.18rem', fontWeight: 800, color: 'var(--text-primary)' },
  resSub: { fontSize: '0.73rem', color: 'var(--text-subtle)' },
  chartBox: {
    background: 'var(--bg-surface-subtle)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    padding: '1rem 1.1rem',
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginBottom: '0.85rem',
  },
  barsContainer: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '4px',
    height: '155px',
    paddingTop: '0.25rem',
  },
  barCol: {
    flex: 1,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    minWidth: 0,
  },
  barTrack: {
    flex: 1,
    width: '100%',
    display: 'flex',
    alignItems: 'flex-end',
  },
  notesHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.75rem',
    marginBottom: '0.5rem',
  },
  notesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
    gap: '1.25rem',
  },
  checklistBox: {
    background: 'var(--bg-surface-subtle)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '10px',
    padding: '1rem',
    alignSelf: 'start',
  },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.35rem 0',
    borderBottom: '1px solid var(--border-subtle)',
  },
};
