import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BuildingIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  BarChartIcon,
  StarIcon,
} from './Icons';
import { useWatchlist } from '../hooks/useWatchlist';
import StockLogo from './StockLogo';

function RankingCard({ title, icon, items = [], valueColor }) {
  const navigate = useNavigate();
  const { isStarred, toggle } = useWatchlist();

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={styles.cardHeader}>
        <span style={styles.headerIcon}>{icon}</span>
        <h3 style={styles.cardTitle}>{title}</h3>
      </div>

      <div>
        {items.length === 0 ? (
          <div style={styles.empty}>Sem dados disponíveis</div>
        ) : (
          items.map((item, idx) => {
            const rank = item.rank ?? idx + 1;
            const color = valueColor ? valueColor(item) : 'var(--text-primary)';
            const displayValue =
              item.value !== undefined
                ? item.value
                : typeof item.change === 'number'
                ? `${item.change >= 0 ? '+' : ''}${item.change.toFixed(2).replace('.', ',')}%`
                : '—';
            const starred = isStarred(item.symbol);

            return (
              <div
                key={`${item.symbol}-${rank}`}
                role="button"
                tabIndex={0}
                className="ranking-row"
                onClick={() => navigate(`/acoes/${item.symbol}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/acoes/${item.symbol}`);
                  }
                }}
                title={`Analisar ${item.symbol}`}
              >
                <span className="mono" style={styles.rankIndex}>
                  {String(rank).padStart(2, '0')}
                </span>
                <StockLogo src={item.logo} symbol={item.symbol} size={30} radius={7} />
                <div style={styles.info}>
                  <span style={styles.symbol}>{item.symbol}</span>
                  <span style={styles.name}>{item.name}</span>
                </div>
                <div style={styles.rightCol}>
                  <div className="num" style={{ ...styles.value, color }}>
                    {displayValue}
                  </div>
                  {typeof item.price === 'number' && (
                    <div className="num" style={styles.subPrice}>
                      R$ {item.price.toFixed(2).replace('.', ',')}
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
                  title={starred ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
                  aria-label={starred ? `Remover ${item.symbol} dos favoritos` : `Adicionar ${item.symbol} aos favoritos`}
                  aria-pressed={starred}
                >
                  <StarIcon size={14} filled={starred} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Rankings({ data }) {
  if (!data) return null;

  return (
    <div className="rankings-grid-2col">
      <RankingCard
        title="Maiores Altas do Dia"
        icon={<TrendingUpIcon size={15} />}
        items={(data.maioresAltas || []).slice(0, 5)}
        valueColor={() => 'var(--positive)'}
      />
      <RankingCard
        title="Maiores Baixas do Dia"
        icon={<TrendingDownIcon size={15} />}
        items={(data.maioresBaixas || []).slice(0, 5)}
        valueColor={() => 'var(--negative)'}
      />
      <RankingCard
        title="Maior Valor de Mercado"
        icon={<BuildingIcon size={15} />}
        items={(data.valorMercado || []).slice(0, 5)}
      />
      <RankingCard
        title="Maior Volume Negociado"
        icon={<BarChartIcon size={15} />}
        items={(data.maioresVolumes || []).slice(0, 5)}
      />
    </div>
  );
}

const styles = {
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.85rem 1.05rem',
    borderBottom: '1px solid var(--border-subtle)',
  },
  headerIcon: {
    color: 'var(--text-muted)',
    display: 'inline-flex',
    alignItems: 'center',
  },
  cardTitle: {
    margin: 0,
    fontSize: '0.88rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '-0.01em',
  },
  empty: {
    padding: '1.5rem',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '0.84rem',
  },
  rankIndex: {
    width: '20px',
    fontSize: '0.72rem',
    fontWeight: 600,
    color: 'var(--text-subtle)',
    flexShrink: 0,
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
  },
  symbol: {
    fontWeight: 700,
    fontSize: '0.86rem',
    color: 'var(--text-primary)',
  },
  name: {
    fontSize: '0.72rem',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  rightCol: {
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  value: {
    fontWeight: 700,
    fontSize: '0.84rem',
  },
  subPrice: {
    fontSize: '0.7rem',
    color: 'var(--text-subtle)',
  },
};

export default Rankings;
