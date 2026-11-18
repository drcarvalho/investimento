import React from 'react';

const PRESETS = [100, 500, 1000, 5000];

function CurrencyConverter({ ptax }) {
  const [amount, setAmount] = React.useState('1000');
  const [direction, setDirection] = React.useState('USD_TO_BRL'); // 'USD_TO_BRL' | 'BRL_TO_USD'

  if (!ptax || !Number.isFinite(Number(ptax.value)) || Number(ptax.value) <= 0) {
    return null;
  }

  const rate = Number(ptax.value);
  const parsed = parseFloat(String(amount).replace(',', '.'));
  const numVal = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  const converted = direction === 'USD_TO_BRL' ? numVal * rate : numVal / rate;

  const fromCode = direction === 'USD_TO_BRL' ? 'USD' : 'BRL';
  const fromSym = direction === 'USD_TO_BRL' ? 'US$' : 'R$';
  const toCode = direction === 'USD_TO_BRL' ? 'BRL' : 'USD';
  const toSym = direction === 'USD_TO_BRL' ? 'R$' : 'US$';

  return (
    <div className="card" style={{ padding: '0.9rem 1rem' }}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Conversor de Dólar</h2>
          <div className="mono" style={styles.sub}>
            PTAX BCB · R$ {rate.toFixed(4).replace('.', ',')}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: '0.28rem 0.58rem', fontSize: '0.73rem' }}
          onClick={() => setDirection((d) => (d === 'USD_TO_BRL' ? 'BRL_TO_USD' : 'USD_TO_BRL'))}
          title="Inverter direção da conversão"
          aria-label="Inverter moedas entre Dólar e Real"
        >
          ⇄ {fromCode}→{toCode}
        </button>
      </div>

      <div style={styles.inputRow}>
        <label htmlFor="ptax-converter-input" className="mono" style={styles.currencyTag}>
          {fromSym}
        </label>
        <input
          id="ptax-converter-input"
          type="number"
          min="0"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="num"
          style={styles.input}
          aria-label={`Valor em ${fromCode}`}
        />
      </div>

      <div style={styles.resultBox}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
          Equivalente em {toCode}
        </span>
        <span className="num" style={styles.resultVal}>
          {toSym} {converted.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      <div style={styles.presetRow}>
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className={`chip-btn mono ${Number(amount) === p ? 'active' : ''}`}
            style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', flex: 1, justifyContent: 'center' }}
            onClick={() => setAmount(String(p))}
          >
            {fromSym} {p >= 1000 ? `${p / 1000}k` : p}
          </button>
        ))}
      </div>

      {ptax.ref_date && (
        <div className="mono" style={styles.footer}>
          Ref. Banco Central: {ptax.ref_date}
        </div>
      )}
    </div>
  );
}

const styles = {
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.5rem',
    marginBottom: '0.7rem',
  },
  title: {
    margin: 0,
    fontSize: '0.88rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  sub: {
    fontSize: '0.68rem',
    color: 'var(--text-subtle)',
    marginTop: 2,
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 9,
    overflow: 'hidden',
    marginBottom: '0.55rem',
  },
  currencyTag: {
    padding: '0.46rem 0.65rem',
    fontSize: '0.76rem',
    fontWeight: 700,
    color: 'var(--text-muted)',
    background: 'var(--bg-surface-subtle)',
    borderRight: '1px solid var(--border-subtle)',
  },
  input: {
    flex: 1,
    minWidth: 0,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    padding: '0.46rem 0.65rem',
    fontSize: '0.88rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  resultBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    background: 'var(--bg-surface-subtle)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 9,
    padding: '0.52rem 0.72rem',
    marginBottom: '0.55rem',
  },
  resultVal: {
    fontSize: '0.96rem',
    fontWeight: 800,
    color: 'var(--positive)',
  },
  presetRow: {
    display: 'flex',
    gap: '0.32rem',
  },
  footer: {
    marginTop: '0.5rem',
    fontSize: '0.66rem',
    color: 'var(--text-subtle)',
    textAlign: 'right',
  },
};

export default CurrencyConverter;

