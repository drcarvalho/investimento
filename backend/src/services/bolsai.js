const { normalizeTicker } = require('../utils/validation');
const db = require('../models/db');

// Optional free-tier bolsai.com connector (200 req/day with X-API-Key in backend/.env)
// Never enabled unless BOLSAI_API_KEY is explicitly configured by the user.
const BOLSAI_BASE = 'https://api.usebolsai.com/api/v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h SQLite cache to preserve 200 req/day quota

async function fetchBolsaiFundamentals(symbol) {
  const apiKey = process.env.BOLSAI_API_KEY;
  if (!apiKey) return null;

  const safeSymbol = normalizeTicker(symbol);
  if (!safeSymbol) return null;

  // Check 24h SQLite cache first
  const cached = await db.getAsync(
    `SELECT * FROM fundamentals WHERE symbol = ? AND source = 'bolsai'`,
    [safeSymbol]
  );
  if (cached && cached.updated_at && Date.now() - new Date(cached.updated_at).getTime() < CACHE_TTL_MS) {
    return cached;
  }

  try {
    const res = await fetch(`${BOLSAI_BASE}/fundamentals/${encodeURIComponent(safeSymbol)}`, {
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: 'application/json',
        'X-API-Key': apiKey,
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const d = json.data || json;
    if (!d || typeof d !== 'object') return null;

    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const updatedAt = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO fundamentals (
        symbol, pl, pvp, ev_ebitda, dy, roe, roa, roic,
        margem_liquida, margem_ebitda, divida_liquida, divida_liquida_ebitda,
        divida_liquida_pl, crescimento_receita, crescimento_lucro, source, reference_date, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET
        pl = COALESCE(excluded.pl, fundamentals.pl),
        pvp = COALESCE(excluded.pvp, fundamentals.pvp),
        ev_ebitda = COALESCE(excluded.ev_ebitda, fundamentals.ev_ebitda),
        dy = COALESCE(excluded.dy, fundamentals.dy),
        roe = COALESCE(excluded.roe, fundamentals.roe),
        roa = COALESCE(excluded.roa, fundamentals.roa),
        roic = COALESCE(excluded.roic, fundamentals.roic),
        margem_liquida = COALESCE(excluded.margem_liquida, fundamentals.margem_liquida),
        margem_ebitda = COALESCE(excluded.margem_ebitda, fundamentals.margem_ebitda),
        divida_liquida = COALESCE(excluded.divida_liquida, fundamentals.divida_liquida),
        divida_liquida_ebitda = COALESCE(excluded.divida_liquida_ebitda, fundamentals.divida_liquida_ebitda),
        divida_liquida_pl = COALESCE(excluded.divida_liquida_pl, fundamentals.divida_liquida_pl),
        crescimento_receita = COALESCE(excluded.crescimento_receita, fundamentals.crescimento_receita),
        crescimento_lucro = COALESCE(excluded.crescimento_lucro, fundamentals.crescimento_lucro),
        source = excluded.source,
        updated_at = excluded.updated_at`,
      [
        safeSymbol,
        num(d.pl ?? d.pe),
        num(d.pvp ?? d.pb),
        num(d.ev_ebitda ?? d.evEbitda),
        num(d.dy ?? d.dividend_yield),
        num(d.roe),
        num(d.roa),
        num(d.roic),
        num(d.margem_liquida ?? d.net_margin),
        num(d.margem_ebitda ?? d.ebitda_margin),
        num(d.divida_liquida ?? d.net_debt),
        num(d.divida_liquida_ebitda ?? d.net_debt_ebitda),
        num(d.divida_liquida_pl ?? d.net_debt_equity),
        num(d.crescimento_receita ?? d.revenue_growth),
        num(d.crescimento_lucro ?? d.earnings_growth),
        'bolsai',
        d.reference_date || updatedAt.slice(0, 10),
        updatedAt,
      ]
    );

    return db.getAsync('SELECT * FROM fundamentals WHERE symbol = ?', [safeSymbol]);
  } catch (err) {
    console.warn(`Bolsai lookup failed for ${safeSymbol}:`, err.message);
    return null;
  }
}

module.exports = { fetchBolsaiFundamentals };

