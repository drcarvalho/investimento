import React from 'react';
import { showToast } from '../components/Toast';
import { sanitizeTicker } from '../utils/security';

const STORAGE_KEY = 'investanalytics_watchlist_v1';

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Schema validation: keep only valid unique B3 tickers (max 50)
    return [...new Set(parsed.map(sanitizeTicker).filter(Boolean))].slice(0, 50);
  } catch {
    return [];
  }
}

export function useWatchlist() {
  const [watchlist, setWatchlist] = React.useState(readStored);

  React.useEffect(() => {
    const onSync = () => setWatchlist(readStored());
    window.addEventListener('watchlist-updated', onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener('watchlist-updated', onSync);
      window.removeEventListener('storage', onSync);
    };
  }, []);

  const toggle = React.useCallback((symbol) => {
    const sym = sanitizeTicker(symbol);
    if (!sym) return;
    const current = readStored();
    const exists = current.includes(sym);
    const next = exists ? current.filter((s) => s !== sym) : [...current, sym].slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setWatchlist(next);
    window.dispatchEvent(new Event('watchlist-updated'));
    showToast(
      exists ? `${sym} removida dos favoritos` : `${sym} adicionada aos favoritos`,
      exists ? 'info' : 'success'
    );
  }, []);

  const isStarred = React.useCallback(
    (symbol) => {
      const sym = sanitizeTicker(symbol);
      return Boolean(sym && watchlist.includes(sym));
    },
    [watchlist]
  );

  return { watchlist, toggle, isStarred };
}
