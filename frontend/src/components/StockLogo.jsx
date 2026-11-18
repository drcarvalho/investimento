import React from 'react';
import { safeHttpUrl } from '../utils/security';

const BG_PALETTE = [
  '#2563eb',
  '#059669',
  '#7c3aed',
  '#d97706',
  '#0284c7',
  '#db2777',
  '#4f46e5',
  '#0d9488',
];

function colorForSymbol(symbol) {
  const s = symbol || 'B3';
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) % BG_PALETTE.length;
  }
  return BG_PALETTE[Math.abs(hash) % BG_PALETTE.length];
}

function StockLogo({ src, symbol = '', size = 34, radius = 8 }) {
  const safeSrc = safeHttpUrl(src, { httpsOnly: true });
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [safeSrc]);

  if (!safeSrc || failed) {
    return (
      <div
        aria-hidden="true"
        className="mono"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: colorForSymbol(symbol),
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: Math.max(10, Math.round(size * 0.34)),
          flexShrink: 0,
          letterSpacing: '-0.02em',
        }}
      >
        {(symbol || 'B3').slice(0, 2)}
      </div>
    );
  }

  return (
    <img
      src={safeSrc}
      alt={symbol}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        objectFit: 'contain',
        background: 'var(--bg-surface-subtle)',
        border: '1px solid var(--border-subtle)',
        padding: Math.max(2, Math.round(size * 0.08)),
        flexShrink: 0,
      }}
    />
  );
}

export default StockLogo;

