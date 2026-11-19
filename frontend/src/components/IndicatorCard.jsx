import React from 'react';
import { InfoIcon } from './Icons';

function IndicatorCard({ title, value, subtitle, color = '#0f766e', highlight, tooltip }) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const valueColor =
    highlight === 'positive'
      ? 'var(--positive)'
      : highlight === 'negative'
      ? 'var(--negative)'
      : 'var(--text-primary)';

  return (
    <div className="indicator-card">
      <div style={styles.topRow}>
        <span style={styles.title}>{title}</span>
        {tooltip && (
          <span ref={wrapRef} className={`tooltip-wrap ${open ? 'open' : ''}`}>
            <button
              type="button"
              className="tooltip-trigger"
              style={{ background: 'none', border: 'none' }}
              aria-label={`Sobre ${title}`}
              onClick={() => setOpen((v) => !v)}
            >
              <InfoIcon size={13} />
            </button>
            <span className="tooltip-popover">{tooltip}</span>
          </span>
        )}
      </div>
      <div className="num" style={{ ...styles.value, color: valueColor }}>
        {value == null || (typeof value === 'number' && Number.isNaN(value)) ? '—' : value}
      </div>
      {subtitle && <div style={styles.subtitle}>{subtitle}</div>}
    </div>
  );
}

const styles = {
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.4rem',
  },
  title: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  value: {
    fontSize: '1.35rem',
    fontWeight: 700,
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: '0.73rem',
    color: 'var(--text-subtle)',
  },
};

export default IndicatorCard;
