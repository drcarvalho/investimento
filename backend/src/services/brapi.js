const { normalizeTicker } = require('../utils/validation');
const { distributedGet, distributedSet, isDistributedCacheEnabled } = require('./cacheStore');

const BRAPI_BASE = 'https://brapi.dev/api';
const BRAPI_V2_BASE = 'https://brapi.dev/api/v2';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_CACHE_ENTRIES = 120;

const ALLOWED_SORT_BY = new Set(['market_cap_basic', 'change', 'volume', 'close', 'name']);
const ALLOWED_RANGES = new Set(['1mo', '3mo', '6mo', '1y']);
const ALLOWED_INTERVALS = new Set(['1d', '1wk']);

// Bounded in-memory TTL cache + singleflight in-flight coalescing + telemetry
const cache = new Map();
const inFlight = new Map();
const cacheStats = {
  hits: 0,
  misses: 0,
  coalescedHits: 0,
  upstreamRequests: 0,
  upstreamErrors: 0,
};
const CACHE_TTL = 60 * 1000; // 1 minute
const LIST_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

function cacheGet(key, ttl = CACHE_TTL) {
  const entry = cache.get(key);
  if (!entry) {
    cacheStats.misses += 1;
    return null;
  }
  if (Date.now() - entry.timestamp >= ttl) {
    cache.delete(key);
    cacheStats.misses += 1;
    return null;
  }
  cacheStats.hits += 1;
  return entry.data;
}

function cacheSet(key, data) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

// Singleflight coalescing prevents duplicate concurrent upstream requests for the same key
async function fetchWithCoalescing(key, ttl, fetcher) {
  const cached = cacheGet(key, ttl);
  if (cached) return cached;

  const existing = inFlight.get(key);
  if (existing) {
    cacheStats.coalescedHits += 1;
    return existing;
  }

  const promise = (async () => {
    try {
      const remoteHit = await distributedGet(`brapi:${key}`);
      if (remoteHit !== null) {
        cacheSet(key, remoteHit);
        cacheStats.hits += 1;
        return remoteHit;
      }
      const data = await fetcher();
      cacheSet(key, data);
      distributedSet(`brapi:${key}`, data, ttl).catch(() => {});
      return data;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

function getCacheStats() {
  const total = cacheStats.hits + cacheStats.misses;
  return {
    ...cacheStats,
    entries: cache.size,
    inFlightCount: inFlight.size,
    maxEntries: MAX_CACHE_ENTRIES,
    distributedCache: isDistributedCacheEnabled(),
    hitRatePct: total > 0 ? Number(((cacheStats.hits / total) * 100).toFixed(1)) : 0,
  };
}

function getBrapiHeaders() {
  const token = (process.env.BRAPI_TOKEN || '').trim();
  return {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchBrapiJson(url, options = {}) {
  cacheStats.upstreamRequests += 1;
  const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: getBrapiHeaders(),
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));

      if (res.status === 401) {
        const err = new Error(
          errorBody.message ||
            'Não autorizado na brapi.dev (HTTP 401). Verifique se a variável BRAPI_TOKEN está configurada e válida.'
        );
        err.status = 401;
        err.code = errorBody.code || 'UNAUTHORIZED';
        throw err;
      }

      if (res.status === 404) {
        const err = new Error(
          errorBody.message || 'Ativo ou recurso não encontrado na brapi.dev (HTTP 404).'
        );
        err.status = 404;
        err.code = errorBody.code || 'NOT_FOUND';
        throw err;
      }

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('Retry-After') || res.headers.get('ratelimit-reset');
        const retryAfterSec = parseInt(retryAfterHeader, 10) || 60;
        const err = new Error(
          errorBody.message ||
            `Limite de requisições na brapi.dev atingido (HTTP 429). Tente novamente em ${retryAfterSec}s.`
        );
        err.status = 429;
        err.code = 'RATE_LIMIT_EXCEEDED';
        err.retryAfter = retryAfterSec;
        throw err;
      }

      const err = new Error(errorBody.message || `Brapi HTTP ${res.status}`);
      err.status = res.status;
      err.code = errorBody.code || `HTTP_${res.status}`;
      throw err;
    }

    return await res.json();
  } catch (err) {
    cacheStats.upstreamErrors += 1;
    throw err;
  }
}

function sanitizeV2Quote(item) {
  if (!item) return null;
  const d = item.data || {};
  const symbol = item.symbol || item.requestedSymbol || null;
  if (!symbol) return null;

  const toFiniteNumOrNull = (val) => {
    if (val === null || val === undefined) return null;
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };

  return {
    symbol,
    requestedSymbol: item.requestedSymbol || symbol,
    name: d.longName || d.shortName || symbol,
    shortName: d.shortName || null,
    longName: d.longName || null,
    currency: d.currency || 'BRL',
    price: toFiniteNumOrNull(d.regularMarketPrice),
    change: toFiniteNumOrNull(d.regularMarketChange),
    changePercent: toFiniteNumOrNull(d.regularMarketChangePercent),
    dayHigh: toFiniteNumOrNull(d.regularMarketDayHigh),
    dayLow: toFiniteNumOrNull(d.regularMarketDayLow),
    dayRange: d.regularMarketDayRange || null,
    open: toFiniteNumOrNull(d.regularMarketOpen),
    previousClose: toFiniteNumOrNull(d.regularMarketPreviousClose),
    volume: toFiniteNumOrNull(d.regularMarketVolume),
    marketCap: toFiniteNumOrNull(d.marketCap),
    fiftyTwoWeekLow: toFiniteNumOrNull(d.fiftyTwoWeekLow),
    fiftyTwoWeekHigh: toFiniteNumOrNull(d.fiftyTwoWeekHigh),
    fiftyTwoWeekRange: d.fiftyTwoWeekRange || null,
    logoUrl: d.logourl || `https://icons.brapi.dev/icons/${symbol}.svg`,
    marketTime: d.regularMarketTime || null,
    updatedAt: d.regularMarketTime || new Date().toISOString(),
  };
}

// Fetch quotes using brapi API v2 (/api/v2/stocks/quote?symbols=...)
async function getQuotesV2(symbols) {
  const symbolList = Array.isArray(symbols)
    ? symbols
    : typeof symbols === 'string'
      ? symbols.split(',')
      : [];

  const validSymbols = [...new Set(symbolList.map(normalizeTicker).filter(Boolean))];
  if (validSymbols.length === 0) return [];

  const key = `v2_quotes_${validSymbols.sort().join(',')}`;

  return fetchWithCoalescing(key, CACHE_TTL, async () => {
    const encodedSymbols = validSymbols.map(encodeURIComponent).join(',');
    const url = `${BRAPI_V2_BASE}/stocks/quote?symbols=${encodedSymbols}`;

    const json = await fetchBrapiJson(url);
    const results = Array.isArray(json?.results) ? json.results : [];
    return results.map(sanitizeV2Quote).filter(Boolean);
  });
}

// Fetch quotes for validated tickers
async function getQuotes(symbols, modules = '') {
  const validSymbols = symbols.map(normalizeTicker).filter(Boolean);
  if (validSymbols.length === 0) return [];

  const safeModules = typeof modules === 'string'
    ? modules.replace(/[^a-zA-Z0-9,]/g, '')
    : '';
  const key = `quotes_${validSymbols.join(',')}_${safeModules}`;

  return fetchWithCoalescing(key, CACHE_TTL, async () => {
    const encoded = validSymbols.map(encodeURIComponent).join(',');
    let url = `${BRAPI_BASE}/quote/${encoded}`;
    if (safeModules) url += `?modules=${encodeURIComponent(safeModules)}`;

    const json = await fetchBrapiJson(url);
    return Array.isArray(json.results) ? json.results : [];
  });
}

// Fetch raw stock list from B3
async function getFullStockList(limit = 150) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 150));
  const key = `full_list_${safeLimit}`;

  return fetchWithCoalescing(key, LIST_CACHE_TTL, async () => {
    const url = `${BRAPI_BASE}/quote/list?sortBy=market_cap_basic&sortOrder=desc&limit=${safeLimit}&type=stock`;
    const json = await fetchBrapiJson(url);

    return (json.stocks || []).filter((s) => {
      if (!s.stock) return false;
      if (s.stock.endsWith('F') && s.stock.length >= 6) return false;
      return true;
    });
  });
}

// Fetch deduplicated stock list sorted by an allowlisted metric
async function getStockList(sortBy = 'market_cap_basic', limit = 30) {
  const safeSort = ALLOWED_SORT_BY.has(sortBy) ? sortBy : 'market_cap_basic';
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
  const key = `list_${safeSort}_${safeLimit}`;

  return fetchWithCoalescing(key, CACHE_TTL, async () => {
    const fetchLimit = Math.min(safeLimit * 3, 200);
    const url = `${BRAPI_BASE}/quote/list?sortBy=${encodeURIComponent(safeSort)}&sortOrder=desc&limit=${fetchLimit}&type=stock`;
    const json = await fetchBrapiJson(url);

    const seen = new Set();
    const unique = [];
    for (const s of json.stocks || []) {
      if (!s.stock) continue;
      if (s.stock.endsWith('F') && s.stock.length >= 6) continue;
      const companyKey = (s.name || s.stock).trim().toUpperCase();
      if (!seen.has(companyKey)) {
        seen.add(companyKey);
        unique.push(s);
      }
      if (unique.length >= safeLimit) break;
    }

    return unique;
  });
}

// Fetch IBOVESPA and IFIX indexes metadata
async function getIndexes() {
  return fetchWithCoalescing('indexes', CACHE_TTL, async () => {
    const url = `${BRAPI_BASE}/quote/list?limit=1`;
    const json = await fetchBrapiJson(url);
    return Array.isArray(json.indexes) ? json.indexes : [];
  });
}

// Fetch historical price data for a ticker
async function getHistory(symbol, range = '3mo', interval = '1d') {
  const safeSymbol = normalizeTicker(symbol);
  if (!safeSymbol) return [];

  const safeRange = ALLOWED_RANGES.has(range) ? range : '3mo';
  const safeInterval = ALLOWED_INTERVALS.has(interval) ? interval : '1d';
  const key = `history_${safeSymbol}_${safeRange}_${safeInterval}`;

  return fetchWithCoalescing(key, 5 * 60 * 1000, async () => {
    const url = `${BRAPI_BASE}/quote/${encodeURIComponent(safeSymbol)}?range=${encodeURIComponent(safeRange)}&interval=${encodeURIComponent(safeInterval)}`;
    const json = await fetchBrapiJson(url);
    return (json.results?.[0]?.historicalDataPrice || [])
      .filter((p) => typeof p.close === 'number' && p.close > 0)
      .map((p) => ({
        date: new Date(p.date * 1000).toISOString().slice(0, 10),
        open: p.open,
        high: p.high,
        low: p.low,
        close: Number(p.close.toFixed(2)),
        volume: p.volume || 0,
      }));
  });
}

// Fetch FIIs and ETFs from brapi free list endpoint (type=fund)
async function getFundsList(subType = 'all', limit = 60) {
  const safeSubType = ['all', 'fii', 'etf'].includes(subType) ? subType : 'all';
  const safeLimit = Math.min(150, Math.max(1, Number(limit) || 60));
  const key = `funds_${safeSubType}_${safeLimit}`;

  return fetchWithCoalescing(key, LIST_CACHE_TTL, async () => {
    const url = `${BRAPI_BASE}/quote/list?sortBy=volume&sortOrder=desc&limit=150&type=fund`;
    const json = await fetchBrapiJson(url);

    let items = (json.stocks || [])
      .filter((s) => {
        const closeNum = Number(s?.close);
        return Boolean(s?.stock) && Number.isFinite(closeNum) && closeNum > 0;
      })
      .map((s) => {
        const st = (s.subType || '').toLowerCase();
        const nameUp = (s.name || '').toUpperCase();
        let assetType = 'fii';
        if (st === 'etf' || nameUp.includes('ETF') || nameUp.includes('INDICE') || nameUp.includes('ÍNDICE')) {
          assetType = 'etf';
        } else if (st === 'fii' || nameUp.includes('IMOBILI') || nameUp.includes('FII')) {
          assetType = 'fii';
        }
        return {
          symbol: s.stock,
          name: s.name || s.stock,
          assetType,
          sector: s.sector || (assetType === 'fii' ? 'Fundos Imobiliários' : 'ETFs'),
          price: Number(s.close),
          change: typeof s.change === 'number' ? s.change : (Number.isFinite(Number(s.change)) ? Number(s.change) : 0),
          volume: Number(s.volume) || 0,
          marketCap: s.market_cap != null ? Number(s.market_cap) : null,
          logo: s.logo || `https://icons.brapi.dev/icons/${s.stock}.svg`,
        };
      });

    if (safeSubType !== 'all') {
      items = items.filter((i) => i.assetType === safeSubType);
    }
    return items.slice(0, safeLimit);
  });
}

async function getDetailedQuotes() {
  return getQuotes(['PETR4', 'VALE3', 'ITUB4', 'MGLU3']);
}

module.exports = {
  getQuotes,
  getQuotesV2,
  getFullStockList,
  getStockList,
  getFundsList,
  getIndexes,
  getHistory,
  getDetailedQuotes,
  getCacheStats,
  getBrapiHeaders,
  fetchWithCoalescing,
  fetchBrapiJson,
};
