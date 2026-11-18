import React from 'react';

const STATUS_MAP = {
  azulim: { cls: 'viab-azulim', dot: '#10b981' },
  viavel: { cls: 'viab-viavel', dot: '#0ea5e9' },
  atencao: { cls: 'viab-atencao', dot: '#f59e0b' },
  risco: { cls: 'viab-risco', dot: '#f43f5e' },
  sem_dados: { cls: 'viab-neutral', dot: '#94a3b8' },
};

export function getViabilityColor(status) {
  return (STATUS_MAP[status] || STATUS_MAP.sem_dados).dot;
}

function ViabilityBadge({ viability, showScore = false }) {
  if (!viability) return null;
  const meta = STATUS_MAP[viability.status] || STATUS_MAP.sem_dados;
  return (
    <span className={`pill ${meta.cls}`}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: meta.dot,
          display: 'inline-block',
        }}
      />
      <span>{viability.label}</span>
      {showScore && viability.score != null && (
        <span className="num" style={{ opacity: 0.85 }}>· {viability.score}</span>
      )}
    </span>
  );
}

export default ViabilityBadge;

