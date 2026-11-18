import React from 'react';
import { useNavigate } from 'react-router-dom';

function SectorPerformance({ sectors = [] }) {
  const navigate = useNavigate();

  if (!sectors || sectors.length === 0) {
    return (
      <div style={{ padding: '2rem 1rem', textAlign: 'center', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
        Dados setoriais indisponíveis no momento.
      </div>
    );
  }

  const maxAbs = Math.max(1, ...sectors.map((s) => Math.abs(s.avgChange || 0)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {sectors.map((sec) => {
        const isPos = sec.avgChange >= 0;
        const barPct = Math.min(100, Math.round((Math.abs(sec.avgChange) / maxAbs) * 100));
        return (
          <div key={sec.sector} className="sector-row">
            <div style={{ minWidth: 0, flex: '1 1 180px' }}>
              <div style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                {sec.sector}
              </div>
              <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
                {sec.count} ativos · {sec.up}↑ {sec.down}↓
              </div>
            </div>

            <div className="sector-bar-track" aria-hidden="true">
              <div className="sector-bar-half sector-bar-left">
                {!isPos && (
                  <div
                    className="sector-bar-fill neg"
                    style={{ width: `${barPct}%` }}
                  />
                )}
              </div>
              <div className="sector-bar-axis" />
              <div className="sector-bar-half sector-bar-right">
                {isPos && (
                  <div
                    className="sector-bar-fill pos"
                    style={{ width: `${barPct}%` }}
                  />
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', justifyContent: 'flex-end', minWidth: 155 }}>
              <span
                className="num"
                style={{
                  fontWeight: 800,
                  fontSize: '0.84rem',
                  color: isPos ? 'var(--positive)' : 'var(--negative)',
                  minWidth: 64,
                  textAlign: 'right',
                }}
              >
                {isPos ? '+' : ''}
                {sec.avgChange.toFixed(2).replace('.', ',')}%
              </span>

              {sec.leader && (
                <button
                  type="button"
                  className="chip-btn mono"
                  style={{ padding: '0.18rem 0.48rem', fontSize: '0.7rem' }}
                  onClick={() => navigate(`/acoes/${sec.leader.symbol}`)}
                  title={`Destaque do setor: ${sec.leader.symbol}`}
                >
                  {sec.leader.symbol}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default SectorPerformance;

