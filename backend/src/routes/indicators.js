const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { getQuotes, getFullStockList, getFundsList, getHistory } = require('../services/brapi');
const { fetchBolsaiFundamentals } = require('../services/bolsai');
const { normalizeTicker, sanitizeSearchQuery } = require('../utils/validation');
const { withTimeout } = require('../utils/async');
const staticIndicators = require('../data/indicators-static.json');

const FREE_TICKERS = new Set(['PETR4', 'VALE3', 'ITUB4', 'MGLU3']);

// Calculate AUVP-inspired viability seal & Graham/Bazin fair prices (never invents missing inputs)
function enrichAnalysis(data) {
  const pl = data.valuation?.pl;
  const pvp = data.valuation?.pvp;
  const dy = data.valuation?.dividendYield;
  const roe = data.rentabilidade?.roe;
  const dividaEbitda = data.endividamento?.dividaLiquidaEbitda;
  const price = data.price;

  const lpa = data.valuation?.lpa ?? (pl && pl > 0 && price ? price / pl : null);
  const vpa = data.valuation?.vpa ?? (pvp && pvp > 0 && price ? price / pvp : null);

  const grahamPrice =
    lpa && lpa > 0 && vpa && vpa > 0
      ? Number(Math.sqrt(22.5 * lpa * vpa).toFixed(2))
      : null;
  const grahamUpside =
    grahamPrice && price > 0
      ? Number((((grahamPrice - price) / price) * 100).toFixed(2))
      : null;

  const bazinPrice =
    dy && dy > 0 && price > 0
      ? Number(((price * (dy / 100)) / 0.06).toFixed(2))
      : null;
  const bazinUpside =
    bazinPrice && price > 0
      ? Number((((bazinPrice - price) / price) * 100).toFixed(2))
      : null;

  let viability = {
    status: 'sem_dados',
    label: 'Sem dados suficientes',
    color: '#64748b',
    bg: '#f1f5f9',
    score: null,
    reasons: [],
  };

  if (pl != null || roe != null || dy != null) {
    let score = 0;
    const reasons = [];

    if (pl != null && pl > 0 && pl <= 12) {
      score += 25;
      reasons.push('P/L descontado (≤ 12)');
    } else if (pl != null && pl > 12 && pl <= 20) {
      score += 15;
      reasons.push('P/L moderado (12–20)');
    } else if (pl != null && pl < 0) {
      reasons.push('Empresa com prejuízo (P/L negativo)');
    } else if (pl != null && pl > 20) {
      score += 5;
      reasons.push('Múltiplo P/L elevado (> 20)');
    }

    if (roe != null && roe >= 15) {
      score += 30;
      reasons.push('ROE forte (≥ 15%)');
    } else if (roe != null && roe >= 10) {
      score += 18;
      reasons.push('ROE adequado (10%–15%)');
    } else if (roe != null) {
      reasons.push('ROE baixo (< 10%)');
    }

    if (dy != null && dy >= 6) {
      score += 25;
      reasons.push('Bom pagador de dividendos (DY ≥ 6%)');
    } else if (dy != null && dy >= 3) {
      score += 15;
      reasons.push('Dividend Yield moderado (3%–6%)');
    } else if (dy != null) {
      score += 5;
      reasons.push('Foco menor em dividendos (DY < 3%)');
    }

    const sectorLower = String(data.sector || '').toLowerCase();
    const isFinancial = /financeir|banco|seguro|previd|intermedi/.test(sectorLower);
    const dividaLiquida = data.endividamento?.dividaLiquida;
    const margemLiquida = data.rentabilidade?.margemLiquida;

    if (isFinancial) {
      score += roe != null && roe >= 10 ? 20 : 10;
      reasons.push('Setor financeiro (Dív. Líq./EBITDA não aplicável)');
    } else if (dividaEbitda == null) {
      score += 15;
    } else if (dividaEbitda < 0) {
      const isNetCash =
        (dividaLiquida != null && dividaLiquida < 0) ||
        (dividaLiquida == null && (margemLiquida == null || margemLiquida > 0) && (pl == null || pl > 0));
      if (isNetCash) {
        score += 20;
        reasons.push('Caixa líquido positivo (dívida líquida negativa)');
      } else {
        reasons.push('EBITDA negativo com endividamento');
      }
    } else if (dividaEbitda <= 2.5) {
      score += 20;
      reasons.push('Endividamento controlado (Dív. Líq./EBITDA ≤ 2,5)');
    } else if (dividaEbitda <= 3.5) {
      score += 10;
      reasons.push('Endividamento moderado');
    } else {
      reasons.push('Alavancagem elevada (Dív. Líq./EBITDA > 3,5)');
    }

    if (score >= 75) {
      viability = { status: 'azulim', label: 'Atrativa', color: '#059669', bg: '#d1fae5', score, reasons };
    } else if (score >= 55) {
      viability = { status: 'viavel', label: 'Viável', color: '#0284c7', bg: '#e0f2fe', score, reasons };
    } else if (score >= 35) {
      viability = { status: 'atencao', label: 'Requer atenção', color: '#d97706', bg: '#fef3c7', score, reasons };
    } else {
      viability = { status: 'risco', label: 'Alto risco', color: '#dc2626', bg: '#fee2e2', score, reasons };
    }
  }

  return {
    ...data,
    valuation: {
      ...data.valuation,
      lpa: lpa != null ? Number(lpa.toFixed(2)) : null,
      vpa: vpa != null ? Number(vpa.toFixed(2)) : null,
    },
    fairValue: {
      grahamPrice,
      grahamUpside,
      bazinPrice,
      bazinUpside,
    },
    viability,
  };
}

// Merge persisted SQLite fundamentals (CVM / bolsai / Python engine) when available
function applyDbFundamentals(base, dbFund) {
  if (!dbFund) return base;
  return {
    ...base,
    valuation: {
      ...base.valuation,
      pl: dbFund.pl ?? base.valuation?.pl ?? null,
      pvp: dbFund.pvp ?? base.valuation?.pvp ?? null,
      evEbitda: dbFund.ev_ebitda ?? base.valuation?.evEbitda ?? null,
      dividendYield: dbFund.dy ?? base.valuation?.dividendYield ?? null,
    },
    rentabilidade: {
      ...base.rentabilidade,
      roe: dbFund.roe ?? base.rentabilidade?.roe ?? null,
      roa: dbFund.roa ?? base.rentabilidade?.roa ?? null,
      roic: dbFund.roic ?? base.rentabilidade?.roic ?? null,
      margemLiquida: dbFund.margem_liquida ?? base.rentabilidade?.margemLiquida ?? null,
      margemEbitda: dbFund.margem_ebitda ?? base.rentabilidade?.margemEbitda ?? null,
    },
    endividamento: {
      ...base.endividamento,
      dividaLiquida: dbFund.divida_liquida ?? base.endividamento?.dividaLiquida ?? null,
      dividaLiquidaEbitda: dbFund.divida_liquida_ebitda ?? base.endividamento?.dividaLiquidaEbitda ?? null,
      dividaLiquidaPl: dbFund.divida_liquida_pl ?? base.endividamento?.dividaLiquidaPl ?? null,
    },
    crescimento: {
      receita: dbFund.crescimento_receita ?? base.crescimento?.receita ?? null,
      lucro: dbFund.crescimento_lucro ?? base.crescimento?.lucro ?? null,
    },
    financials: {
      ...(base.financials || {}),
      totalRevenue: dbFund.receita_liquida ?? base.financials?.totalRevenue ?? null,
      netIncome: dbFund.lucro_liquido ?? base.financials?.netIncome ?? null,
      equity: dbFund.patrimonio_liquido ?? base.financials?.equity ?? null,
    },
    fundamentalSource: dbFund.source || base.source,
    referenceDate: dbFund.reference_date || null,
  };
}

async function fetchLiveIndicators(symbol, dbFund) {
  const modules = 'summaryProfile,defaultKeyStatistics,financialData';
  const results = await getQuotes([symbol], modules);
  if (!results || results.length === 0) return null;

  const q = results[0];
  const stats = q.defaultKeyStatistics || {};
  const financial = q.financialData || {};
  const profile = q.summaryProfile || {};
  const fallback = staticIndicators[symbol] || {};

  const dividaLiquida =
    financial.totalDebt != null && financial.totalCash != null
      ? Number((financial.totalDebt - financial.totalCash).toFixed(0))
      : dbFund?.divida_liquida ?? null;

  const dividaLiquidaEbitda =
    dividaLiquida != null && financial.ebitda
      ? Number((dividaLiquida / financial.ebitda).toFixed(2))
      : dbFund?.divida_liquida_ebitda ?? fallback.endividamento?.dividaLiquidaEbitda ?? null;

  const dyRaw = stats.dividendYield ?? stats.yield;
  const dyNormalized = dyRaw != null ? (Math.abs(dyRaw) <= 1 ? dyRaw * 100 : dyRaw) : null;
  const dividendYield =
    dyNormalized != null
      ? Number(dyNormalized.toFixed(2))
      : dbFund?.dy ?? fallback.valuation?.dividendYield ?? null;

  const pl = q.priceEarnings ?? stats.trailingPE ?? dbFund?.pl ?? fallback.valuation?.pl ?? null;
  const pvp = stats.priceToBook ?? dbFund?.pvp ?? fallback.valuation?.pvp ?? null;
  const evEbitda = stats.enterpriseToEbitda ?? dbFund?.ev_ebitda ?? fallback.valuation?.evEbitda ?? null;

  const data = {
    symbol: q.symbol,
    name: q.longName || q.shortName || fallback.name || symbol,
    assetType: 'stock',
    sector: profile.sector || fallback.sector || 'Ações B3',
    subsector: profile.industry || fallback.subsector || null,
    profile: {
      summary: profile.longBusinessSummary || null,
      website: profile.website || null,
      cnpj: profile.cnpj || null,
      listingSegment: profile.listingSegment || null,
      employees: profile.fullTimeEmployees || null,
    },
    valuation: {
      pl: pl != null ? Number(pl.toFixed(2)) : null,
      pvp: pvp != null ? Number(pvp.toFixed(2)) : null,
      evEbitda: evEbitda != null ? Number(evEbitda.toFixed(2)) : null,
      dividendYield,
      lpa: q.earningsPerShare ?? stats.trailingEps ?? null,
    },
    rentabilidade: {
      roe: financial.returnOnEquity != null ? Number((financial.returnOnEquity * 100).toFixed(2)) : (dbFund?.roe ?? fallback.rentabilidade?.roe ?? null),
      roa: financial.returnOnAssets != null ? Number((financial.returnOnAssets * 100).toFixed(2)) : (dbFund?.roa ?? fallback.rentabilidade?.roa ?? null),
      roic: dbFund?.roic ?? fallback.rentabilidade?.roic ?? null,
      margemBruta: financial.grossMargins != null ? Number((financial.grossMargins * 100).toFixed(2)) : null,
      margemLiquida: financial.profitMargins != null ? Number((financial.profitMargins * 100).toFixed(2)) : (dbFund?.margem_liquida ?? fallback.rentabilidade?.margemLiquida ?? null),
      margemEbitda: financial.ebitdaMargins != null ? Number((financial.ebitdaMargins * 100).toFixed(2)) : (dbFund?.margem_ebitda ?? fallback.rentabilidade?.margemEbitda ?? null),
      margemOperacional: financial.operatingMargins != null ? Number((financial.operatingMargins * 100).toFixed(2)) : null,
    },
    endividamento: {
      dividaLiquida,
      dividaLiquidaEbitda,
      dividaLiquidaPl: financial.debtToEquity != null ? Number(financial.debtToEquity.toFixed(2)) : (dbFund?.divida_liquida_pl ?? fallback.endividamento?.dividaLiquidaPl ?? null),
      liquidezCorrente: financial.currentRatio != null ? Number(financial.currentRatio.toFixed(2)) : null,
    },
    crescimento: {
      receita: financial.revenueGrowth != null ? Number((financial.revenueGrowth * 100).toFixed(2)) : (dbFund?.crescimento_receita ?? null),
      lucro: financial.earningsGrowth != null ? Number((financial.earningsGrowth * 100).toFixed(2)) : (dbFund?.crescimento_lucro ?? null),
    },
    financials: {
      totalRevenue: financial.totalRevenue ?? dbFund?.receita_liquida ?? null,
      ebitda: financial.ebitda ?? null,
      totalCash: financial.totalCash ?? null,
      totalDebt: financial.totalDebt ?? null,
      freeCashflow: financial.freeCashflow ?? null,
      netIncome: dbFund?.lucro_liquido ?? null,
      equity: dbFund?.patrimonio_liquido ?? null,
    },
    price: q.regularMarketPrice,
    change: q.regularMarketChangePercent,
    dayHigh: q.regularMarketDayHigh,
    dayLow: q.regularMarketDayLow,
    volume: q.regularMarketVolume,
    marketCap: q.marketCap,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow,
    previousClose: q.regularMarketPreviousClose,
    logo: q.logourl || `https://icons.brapi.dev/icons/${symbol}.svg`,
    source: 'brapi-live',
    updatedAt: q.regularMarketTime || new Date().toISOString(),
  };

  return enrichAnalysis(data);
}

// GET /api/indicators — Screener list (SQLite CVM/Python fundamentals + static + live B3 prices)
router.get('/', async (req, res) => {
  try {
    const [liveList, dbFunds] = await Promise.all([
      withTimeout(getFullStockList(150), 6500, []),
      withTimeout(db.allAsync('SELECT * FROM fundamentals'), 3000, []),
    ]);

    const liveMap = new Map(liveList.map((s) => [s.stock.toUpperCase(), s]));
    const dbFundMap = new Map(dbFunds.map((f) => [f.symbol.toUpperCase(), f]));

    let items = Object.values(staticIndicators).map((item) => {
      const sym = item.symbol.toUpperCase();
      const live = liveMap.get(sym);
      const dbFund = dbFundMap.get(sym);
      const merged = applyDbFundamentals(
        {
          ...item,
          assetType: 'stock',
          price: live?.close ?? item.price,
          change: live?.change ?? item.change,
          volume: live?.volume ?? item.volume,
          marketCap: live?.market_cap ?? item.marketCap,
          logo: live?.logo || `https://icons.brapi.dev/icons/${item.symbol}.svg`,
          livePrice: Boolean(live),
        },
        dbFund
      );
      return enrichAnalysis(merged);
    });

    const { sector, minDy, maxPl, minRoe, maxPvp, viability, q } = req.query;

    if (q) {
      const term = sanitizeSearchQuery(q).toUpperCase();
      if (term) {
        items = items.filter(
          (s) => s.symbol.includes(term) || s.name.toUpperCase().includes(term) || (s.sector || '').toUpperCase().includes(term)
        );
      }
    }
    if (sector && sector !== 'Todos') {
      items = items.filter((s) => s.sector === sector);
    }
    if (minDy !== undefined && minDy !== '') {
      const v = parseFloat(minDy);
      if (!isNaN(v)) items = items.filter((s) => (s.valuation.dividendYield ?? -Infinity) >= v);
    }
    if (maxPl !== undefined && maxPl !== '') {
      const v = parseFloat(maxPl);
      if (!isNaN(v)) items = items.filter((s) => s.valuation.pl != null && s.valuation.pl > 0 && s.valuation.pl <= v);
    }
    if (minRoe !== undefined && minRoe !== '') {
      const v = parseFloat(minRoe);
      if (!isNaN(v)) items = items.filter((s) => (s.rentabilidade.roe ?? -Infinity) >= v);
    }
    if (maxPvp !== undefined && maxPvp !== '') {
      const v = parseFloat(maxPvp);
      if (!isNaN(v)) items = items.filter((s) => s.valuation.pvp != null && s.valuation.pvp > 0 && s.valuation.pvp <= v);
    }
    if (viability && viability !== 'Todos') {
      items = items.filter((s) => s.viability.status === viability);
    }

    const sectors = [...new Set(Object.values(staticIndicators).map((s) => s.sector))].sort();

    res.json({
      updatedAt: new Date().toISOString(),
      count: items.length,
      sectors,
      stocks: items,
    });
  } catch (err) {
    console.error('Error in screener:', err.message);
    res.status(500).json({ error: 'Falha ao carregar dados do screening' });
  }
});

// GET /api/indicators/:symbol/history?range=1mo|3mo|6mo|1y — REAL DATA ONLY (never invented)
router.get('/:symbol/history', async (req, res) => {
  try {
    const symbol = normalizeTicker(req.params.symbol);
    if (!symbol) {
      return res.status(400).json({ error: 'Ticker inválido' });
    }
    const allowed = new Set(['1mo', '3mo', '6mo', '1y']);
    const range = allowed.has(req.query.range) ? req.query.range : '3mo';
    const daysMap = { '1mo': 32, '3mo': 95, '6mo': 185, '1y': 370 };

    // 1. Try live brapi history for free tickers (or all tickers if BRAPI_TOKEN is set)
    if (FREE_TICKERS.has(symbol) || process.env.BRAPI_TOKEN) {
      try {
        const points = await getHistory(symbol, range, '1d');
        if (points && points.length > 1) {
          // Persist real candles atomically (SQLite or PostgreSQL/Supabase)
          db.upsertPriceHistory(symbol, points).catch((err) =>
            console.warn(`DB history cache write skipped for ${symbol}:`, err.message)
          );
          return res.json({ symbol, range, source: 'brapi-live', points });
        }
      } catch (e) {
        console.warn(`Live history fetch failed for ${symbol}:`, e.message);
      }
    }

    // 2. Check SQLite real cached history (populated by Python collector or prior brapi fetches)
    const cutoff = new Date(Date.now() - daysMap[range] * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dbRows = await db.allAsync(
      'SELECT date, open, high, low, close, volume, source FROM price_history WHERE symbol = ? AND date >= ? ORDER BY date ASC',
      [symbol, cutoff]
    );
    if (dbRows.length > 1) {
      return res.json({
        symbol,
        range,
        source: dbRows[dbRows.length - 1].source || 'sqlite-cache',
        points: dbRows.map(({ source, ...rest }) => rest),
      });
    }

    // 3. Never invent fake price curves — be transparent when unavailable on free tier
    return res.json({
      symbol,
      range,
      source: 'unavailable',
      points: [],
      message:
        'Série histórica real indisponível sem token na brapi.dev para este ativo. Configure BRAPI_TOKEN no .env ou execute o coletor Python.',
    });
  } catch (err) {
    console.error('Error fetching history:', err.message);
    res.status(500).json({ error: 'Falha ao carregar histórico de cotações' });
  }
});

// GET /api/indicators/:symbol — Detailed analysis for Stocks, FIIs & ETFs
router.get('/:symbol', async (req, res) => {
  try {
    const symbol = normalizeTicker(req.params.symbol);
    if (!symbol) {
      return res.status(400).json({ error: 'Ticker inválido (ex: PETR4, VALE3, MXRF11, BOVA11)' });
    }

    // Check SQLite fundamentals (CVM / Python / bolsai)
    let dbFund = await withTimeout(db.getAsync('SELECT * FROM fundamentals WHERE symbol = ?', [symbol]), 3000, null);
    if (!dbFund && process.env.BOLSAI_API_KEY) {
      dbFund = await fetchBolsaiFundamentals(symbol);
    }

    // 1. Live full modules for free tickers (or any ticker if BRAPI_TOKEN is set)
    if (FREE_TICKERS.has(symbol) || process.env.BRAPI_TOKEN) {
      try {
        const liveData = await fetchLiveIndicators(symbol, dbFund);
        if (liveData) return res.json(liveData);
      } catch (e) {
        console.warn(`Live module fetch failed for ${symbol}:`, e.message);
      }
    }

    // 2. Check live B3 stocks AND funds (FIIs / ETFs)
    let liveItem = null;
    let detectedType = 'stock';
    try {
      const [liveStocks, liveFunds] = await Promise.all([
        getFullStockList(150).catch(() => []),
        getFundsList('all', 150).catch(() => []),
      ]);
      const foundStock = liveStocks.find((s) => s.stock.toUpperCase() === symbol);
      if (foundStock) {
        liveItem = {
          symbol: foundStock.stock,
          name: foundStock.name,
          sector: foundStock.sector,
          subsector: foundStock.subsector,
          price: foundStock.close,
          change: foundStock.change,
          volume: foundStock.volume,
          marketCap: foundStock.market_cap,
          logo: foundStock.logo,
        };
      } else {
        const foundFund = liveFunds.find((f) => f.symbol.toUpperCase() === symbol);
        if (foundFund) {
          liveItem = foundFund;
          detectedType = foundFund.assetType;
        }
      }
    } catch (e) {
      console.warn('Could not fetch live lists:', e.message);
    }

    // 3. Merge static indicators + SQLite CVM/Python fundamentals + live B3 price
    if (staticIndicators[symbol]) {
      const base = staticIndicators[symbol];
      const merged = applyDbFundamentals(
        {
          ...base,
          assetType: detectedType,
          price: liveItem?.price ?? base.price,
          change: liveItem?.change ?? base.change,
          volume: liveItem?.volume ?? base.volume,
          marketCap: liveItem?.marketCap ?? base.marketCap,
          logo: liveItem?.logo || `https://icons.brapi.dev/icons/${symbol}.svg`,
          source: dbFund?.source
            ? `live-price+${dbFund.source}`
            : liveItem
            ? 'live-price+fundamentals'
            : 'static',
          updatedAt: new Date().toISOString(),
        },
        dbFund
      );
      return res.json(enrichAnalysis(merged));
    }

    // 3b. Fallback to persisted DB assets table when live upstream is unreachable
    if (!liveItem) {
      const dbAsset = await db.getAsync(
        'SELECT symbol, name, asset_type, sector, subsector, logo, price, change_pct, volume, market_cap FROM assets WHERE symbol = ?',
        [symbol]
      ).catch(() => null);
      if (dbAsset) {
        liveItem = {
          symbol: dbAsset.symbol,
          name: dbAsset.name,
          sector: dbAsset.sector,
          subsector: dbAsset.subsector,
          price: dbAsset.price,
          change: dbAsset.change_pct,
          volume: dbAsset.volume,
          marketCap: dbAsset.market_cap,
          logo: dbAsset.logo,
        };
        detectedType = dbAsset.asset_type || detectedType;
      }
    }

    // 4. Stock, FII or ETF exists on live B3 list or DB cache (never invent missing indicators -> null)
    if (liveItem) {
      const basicLive = applyDbFundamentals(
        {
          symbol: liveItem.symbol,
          name: liveItem.name || liveItem.symbol,
          assetType: detectedType,
          sector: liveItem.sector || (detectedType === 'fii' ? 'Fundos Imobiliários' : detectedType === 'etf' ? 'ETFs' : 'B3'),
          subsector: liveItem.subsector || null,
          valuation: { pl: null, pvp: null, evEbitda: null, dividendYield: null },
          rentabilidade: { roe: null, roa: null, roic: null, margemLiquida: null, margemEbitda: null },
          endividamento: { dividaLiquida: null, dividaLiquidaEbitda: null, dividaLiquidaPl: null },
          crescimento: { receita: null, lucro: null },
          price: liveItem.price,
          change: liveItem.change,
          dayHigh: null,
          dayLow: null,
          volume: liveItem.volume,
          marketCap: liveItem.marketCap,
          fiftyTwoWeekHigh: null,
          fiftyTwoWeekLow: null,
          logo: liveItem.logo || `https://icons.brapi.dev/icons/${symbol}.svg`,
          source: dbFund?.source ? `brapi-live+${dbFund.source}` : 'brapi-list-live',
          updatedAt: new Date().toISOString(),
        },
        dbFund
      );
      return res.json(enrichAnalysis(basicLive));
    }

    return res.status(404).json({
      error: `Ativo "${symbol}" não encontrado`,
      availableSymbols: Object.keys(staticIndicators),
    });
  } catch (err) {
    console.error('Error fetching indicators:', err.message);
    res.status(500).json({ error: 'Falha ao carregar indicadores do ativo' });
  }
});

module.exports = router;
