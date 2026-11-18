import React from 'react';
import { sanitizeTicker } from '../utils/security';

const STORAGE_KEY = 'investanalytics_recent_v1';
const MAX_RECENT = 6;

function readRecent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map(sanitizeTicker).filter(Boolean))].slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function recordRecentStock(symbol) {
  const sym = sanitizeTicker(symbol);
  if (!sym) return;
  const current = readRecent().filter((s) => s !== sym);
  const next = [sym, ...current].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('recent-stocks-updated'));
  } catch {}
}

export function useRecentStocks() {
  const [recent, setRecent] = React.useState(readRecent);

  React.useEffect(() => {
    const onSync = () => setRecent(readRecent());
    window.addEventListener('recent-stocks-updated', onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener('recent-stocks-updated', onSync);
      window.removeEventListener('storage', onSync);
    };
  }, []);

  return recent;
}

