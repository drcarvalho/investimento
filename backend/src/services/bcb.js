const db = require('../models/db');
const { withTimeout } = require('../utils/async');

// Official Banco Central do Brasil (SGS) public open-data series (ODbL, zero auth, free)
const BCB_SERIES = [
  { key: 'selic', code: 432, name: 'Meta Selic', unit: '% a.a.' },
  { key: 'ipca_12m', code: 13522, name: 'IPCA (12 meses)', unit: '%' },
  { key: 'ipca_mensal', code: 433, name: 'IPCA (Mensal)', unit: '%' },
  { key: 'ptax_usd', code: 10813, name: 'Dólar PTAX', unit: 'R$' },
];

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const TIMEOUT_MS = 5500;
const REQUEST_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'User-Agent': 'Mozilla/5.0 (compatible; InvestimentoFlash/1.0; +https://github.com)',
};

// In-memory L1 cache so warm serverless instances never block on DB or BCB
let memoryCache = {
  indicators: [],
  timestamp: 0,
  source: 'Banco Central do Brasil (SGS — Dados Abertos)',
};

const bcbStats = {
  requests: 0,
  errors: 0,
  cacheHits: 0,
  partialFallbacks: 0,
};

function getBcbStats() {
  return { ...bcbStats };
}

function formatBrDate(dateObj) {
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const yyyy = dateObj.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function fetchJsonWithTimeout(url, timeoutMs = TIMEOUT_MS) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: REQUEST_HEADERS,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchSeriesLatest(code) {
  bcbStats.requests += 1;
  const primaryUrl = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/1?formato=json`;
  try {
    const arr = await fetchJsonWithTimeout(primaryUrl);
    if (Array.isArray(arr) && arr.length > 0) {
      const latest = arr[arr.length - 1];
      const value = Number(String(latest.valor).replace(',', '.'));
      if (Number.isFinite(value)) {
        return { value, ref_date: latest.data, source: 'BCB SGS' };
      }
    }
  } catch {
    // Fallback to explicit 90-day window (BCB SGS occasionally rejects /ultimos/1 from cloud IPs)
  }

  try {
    const end = new Date();
    const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
    const windowUrl = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${formatBrDate(start)}&dataFinal=${formatBrDate(end)}`;
    const arr = await fetchJsonWithTimeout(windowUrl);
    if (Array.isArray(arr) && arr.length > 0) {
      const latest = arr[arr.length - 1];
      const value = Number(String(latest.valor).replace(',', '.'));
      if (Number.isFinite(value)) {
        return { value, ref_date: latest.data, source: 'BCB SGS' };
      }
    }
    return null;
  } catch (err) {
    bcbStats.errors += 1;
    throw err;
  }
}

// Secondary free real-data providers (BrasilAPI + AwesomeAPI) when BCB SGS blocks US cloud IPs (e.g. Vercel iad1)
async function fetchSecondaryMacroFallbacks(missingKeys) {
  const recovered = [];
  const needRates = missingKeys.has('selic') || missingKeys.has('ipca_12m');
  const needUsd = missingKeys.has('ptax_usd');
  const todayBr = formatBrDate(new Date());
  const updatedAt = new Date().toISOString();

  const tasks = [];

  if (needRates) {
    tasks.push(
      fetchJsonWithTimeout('https://brasilapi.com.br/api/taxas/v1', 4500)
        .then((taxas) => {
          if (!Array.isArray(taxas)) return;
          for (const t of taxas) {
            const nome = String(t.nome || '').trim().toUpperCase();
            const val = Number(t.valor);
            if (!Number.isFinite(val)) continue;
            if (nome === 'SELIC' && missingKeys.has('selic')) {
              recovered.push({
                key: 'selic',
                name: 'Meta Selic',
                value: val,
                unit: '% a.a.',
                ref_date: todayBr,
                source: 'BrasilAPI / BCB',
                updated_at: updatedAt,
              });
            } else if (nome === 'IPCA' && missingKeys.has('ipca_12m')) {
              recovered.push({
                key: 'ipca_12m',
                name: 'IPCA (12 meses)',
                value: val,
                unit: '%',
                ref_date: todayBr,
                source: 'BrasilAPI / IBGE',
                updated_at: updatedAt,
              });
            }
          }
        })
        .catch(() => {})
    );
  }

  if (needUsd) {
    tasks.push(
      fetchJsonWithTimeout('https://economia.awesomeapi.com.br/json/last/USD-BRL', 4500)
        .then((json) => {
          const bid = Number(json?.USDBRL?.bid);
          if (!Number.isFinite(bid) || bid <= 0) return;
          const createDate = String(json?.USDBRL?.create_date || '').slice(0, 10);
          const refDate = createDate && createDate.includes('-')
            ? createDate.split('-').reverse().join('/')
            : todayBr;
          recovered.push({
            key: 'ptax_usd',
            name: 'Dólar PTAX',
            value: Number(bid.toFixed(4)),
            unit: 'R$',
            ref_date: refDate,
            source: 'AwesomeAPI (USD/BRL)',
            updated_at: updatedAt,
          });
        })
        .catch(() => {})
    );
  }

  if (missingKeys.has('ipca_mensal')) {
    // Official IBGE SIDRA API (Table 1737, Variable 63 = IPCA monthly variation %)
    tasks.push(
      fetchJsonWithTimeout('https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/63/p/last%201?formato=json', 4500)
        .then((arr) => {
          if (!Array.isArray(arr) || arr.length < 2) return;
          const row = arr[arr.length - 1];
          const val = Number(String(row?.V || '').replace(',', '.'));
          if (!Number.isFinite(val)) return;
          const refLabel = String(row?.D3N || todayBr);
          recovered.push({
            key: 'ipca_mensal',
            name: 'IPCA (Mensal)',
            value: val,
            unit: '%',
            ref_date: refLabel,
            source: 'IBGE SIDRA',
            updated_at: updatedAt,
          });
        })
        .catch(() => {})
    );
  }

  await Promise.allSettled(tasks);
  return recovered;
}

async function persistMacroItem(item) {
  await withTimeout(
    db.runAsync(
      `INSERT INTO macro_indicators (key, name, value, unit, ref_date, source, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         name = excluded.name,
         value = excluded.value,
         unit = excluded.unit,
         ref_date = excluded.ref_date,
         source = excluded.source,
         updated_at = excluded.updated_at`,
      [item.key, item.name, item.value, item.unit, item.ref_date, item.source, item.updated_at]
    ),
    2500,
    null
  );
}

async function getMacroIndicators({ forceRefresh = false } = {}) {
  const now = Date.now();

  // 1. Check in-memory L1 cache first
  if (
    !forceRefresh &&
    memoryCache.indicators.length === BCB_SERIES.length &&
    now - memoryCache.timestamp < CACHE_TTL_MS
  ) {
    bcbStats.cacheHits += 1;
    return {
      source: memoryCache.source,
      cached: true,
      indicators: memoryCache.indicators,
    };
  }

  // 2. Check DB cache safely (never throw or block if DB is slow/offline)
  const cachedRows = await withTimeout(
    db.allAsync('SELECT key, name, value, unit, ref_date, source, updated_at FROM macro_indicators'),
    2500,
    []
  );

  const isFresh =
    !forceRefresh &&
    cachedRows.length === BCB_SERIES.length &&
    cachedRows.every((r) => r.updated_at && now - new Date(r.updated_at).getTime() < CACHE_TTL_MS);

  if (isFresh) {
    const ordered = BCB_SERIES.map((s) => cachedRows.find((r) => r.key === s.key)).filter(Boolean);
    memoryCache = {
      indicators: ordered,
      timestamp: now,
      source: 'Banco Central do Brasil (SGS — Dados Abertos)',
    };
    bcbStats.cacheHits += 1;
    return {
      source: memoryCache.source,
      cached: true,
      indicators: ordered,
    };
  }

  // 3. Fetch live from BCB SGS in parallel (DB persistence failures never discard live values)
  const results = await Promise.allSettled(
    BCB_SERIES.map(async (s) => {
      const latest = await fetchSeriesLatest(s.code);
      if (!latest) return null;
      const item = {
        key: s.key,
        name: s.name,
        value: latest.value,
        unit: s.unit,
        ref_date: latest.ref_date,
        source: latest.source,
        updated_at: new Date().toISOString(),
      };
      persistMacroItem(item).catch(() => {});
      return item;
    })
  );

  const mergedMap = new Map(cachedRows.map((r) => [r.key, r]));
  let liveCount = 0;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      mergedMap.set(r.value.key, r.value);
      liveCount += 1;
    }
  }

  // 4. For any series BCB did not return (e.g., BCB geo-blocking US serverless IPs), query free official secondary sources
  const missingKeys = new Set(
    BCB_SERIES.map((s) => s.key).filter((k) => {
      const existing = mergedMap.get(k);
      if (!existing) return true;
      return forceRefresh && !results.some((r) => r.status === 'fulfilled' && r.value?.key === k);
    })
  );

  if (missingKeys.size > 0) {
    bcbStats.partialFallbacks += 1;
    const secondary = await fetchSecondaryMacroFallbacks(missingKeys);
    for (const item of secondary) {
      mergedMap.set(item.key, item);
      persistMacroItem(item).catch(() => {});
      liveCount += 1;
    }
  }

  const ordered = BCB_SERIES.map((s) => mergedMap.get(s.key)).filter(Boolean);
  if (ordered.length > 0) {
    const sourceLabel =
      liveCount >= BCB_SERIES.length
        ? 'Banco Central / IBGE (Dados Abertos)'
        : 'Banco Central / Fontes Públicas (Cache + Ao vivo)';
    memoryCache = {
      indicators: ordered,
      timestamp: now,
      source: sourceLabel,
    };
    return {
      source: sourceLabel,
      cached: liveCount === 0,
      indicators: ordered,
    };
  }

  return {
    source: 'Banco Central do Brasil (SGS — Indisponível temporariamente)',
    cached: true,
    indicators: [],
  };
}

module.exports = { getMacroIndicators, getBcbStats };
