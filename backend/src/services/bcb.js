const db = require('../models/db');

// Official Banco Central do Brasil (SGS) public open-data series (ODbL, zero auth, free)
const BCB_SERIES = [
  { key: 'selic', code: 432, name: 'Meta Selic', unit: '% a.a.' },
  { key: 'ipca_12m', code: 13522, name: 'IPCA (12 meses)', unit: '%' },
  { key: 'ipca_mensal', code: 433, name: 'IPCA (Mensal)', unit: '%' },
  { key: 'ptax_usd', code: 10813, name: 'Dólar PTAX', unit: 'R$' },
];

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours persistent cache in SQLite
const TIMEOUT_MS = 7000;

const bcbStats = {
  requests: 0,
  errors: 0,
  cacheHits: 0,
  partialFallbacks: 0,
};

function getBcbStats() {
  return { ...bcbStats };
}

async function fetchSeriesLatest(code) {
  bcbStats.requests += 1;
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/1?formato=json`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`BCB HTTP ${res.status}`);
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const latest = arr[0];
    const value = Number(String(latest.valor).replace(',', '.'));
    if (!Number.isFinite(value)) return null;
    return { value, ref_date: latest.data };
  } catch (err) {
    bcbStats.errors += 1;
    throw err;
  }
}

async function getMacroIndicators({ forceRefresh = false } = {}) {
  const cachedRows = await db.allAsync(
    'SELECT key, name, value, unit, ref_date, source, updated_at FROM macro_indicators'
  );
  const now = Date.now();
  const isFresh =
    !forceRefresh &&
    cachedRows.length === BCB_SERIES.length &&
    cachedRows.every((r) => r.updated_at && now - new Date(r.updated_at).getTime() < CACHE_TTL_MS);

  if (isFresh) {
    bcbStats.cacheHits += 1;
    return {
      source: 'Banco Central do Brasil (SGS — Dados Abertos)',
      cached: true,
      indicators: cachedRows,
    };
  }

  const results = await Promise.allSettled(
    BCB_SERIES.map(async (s) => {
      const latest = await fetchSeriesLatest(s.code);
      if (!latest) return null;
      const updatedAt = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO macro_indicators (key, name, value, unit, ref_date, source, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           name = excluded.name,
           value = excluded.value,
           unit = excluded.unit,
           ref_date = excluded.ref_date,
           source = excluded.source,
           updated_at = excluded.updated_at`,
        [s.key, s.name, latest.value, s.unit, latest.ref_date, 'BCB SGS', updatedAt]
      );
      return {
        key: s.key,
        name: s.name,
        value: latest.value,
        unit: s.unit,
        ref_date: latest.ref_date,
        source: 'BCB SGS',
        updated_at: updatedAt,
      };
    })
  );

  const freshItems = results
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value);

  if (freshItems.length > 0) {
    if (freshItems.length < BCB_SERIES.length) bcbStats.partialFallbacks += 1;
    // Merge fresh series with any cached SQLite series so partial upstream timeouts never drop cards
    const mergedMap = new Map(cachedRows.map((r) => [r.key, r]));
    for (const item of freshItems) {
      mergedMap.set(item.key, item);
    }
    const ordered = BCB_SERIES.map((s) => mergedMap.get(s.key)).filter(Boolean);
    return {
      source: 'Banco Central do Brasil (SGS — Dados Abertos)',
      cached: freshItems.length < BCB_SERIES.length,
      indicators: ordered,
    };
  }

  bcbStats.partialFallbacks += 1;
  // Fallback to stale cached SQLite rows if BCB is temporarily unreachable (never invent!)
  return {
    source: 'Banco Central do Brasil (SGS — Cache local)',
    cached: true,
    indicators: cachedRows,
  };
}

module.exports = { getMacroIndicators, getBcbStats };

