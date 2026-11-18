const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const router = express.Router();
const db = require('../models/db');
const staticIndicators = require('../data/indicators-static.json');
const { getFullStockList } = require('../services/brapi');
const { normalizeTicker } = require('../utils/validation');
const { timingSafeEqualStr, isLoopbackIp } = require('../middleware/security');

let engineRunning = false;
let lastEngineRunAt = 0;
const ENGINE_COOLDOWN_MS = 30 * 1000;

function parseJson(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function buildFallbackRankings() {
  const entries = Object.entries(staticIndicators);
  const list = entries.map(([sym, item]) => {
    const val = item.valuation || {};
    const rent = item.rentabilidade || {};
    const endiv = item.endividamento || {};

    let score = 50;
    const positives = [];
    const risks = [];

    if (val.pl && val.pl > 0 && val.pl < 12) {
      score += 15;
      positives.push(`P/L atrativo de ${val.pl}x`);
    } else if (val.pl && val.pl > 25) {
      score -= 10;
      risks.push(`Múltiplo P/L elevado (${val.pl}x)`);
    }

    if (val.dividendYield && val.dividendYield >= 6) {
      score += 15;
      positives.push(`Dividend Yield robusto (${val.dividendYield}% a.a.)`);
    }

    if (rent.roe && rent.roe >= 15) {
      score += 15;
      positives.push(`Rentabilidade sobre patrimônio elevada (ROE ${rent.roe}%)`);
    }

    if (endiv.dividaLiquidaEbitda && endiv.dividaLiquidaEbitda <= 2.0) {
      score += 10;
      positives.push(`Alavancagem controlada (Dív.Líq/EBITDA ${endiv.dividaLiquidaEbitda}x)`);
    } else if (endiv.dividaLiquidaEbitda && endiv.dividaLiquidaEbitda > 3.5) {
      score -= 15;
      risks.push(`Endividamento elevado (${endiv.dividaLiquidaEbitda}x EBITDA)`);
    }

    score = Math.min(98, Math.max(25, score));
    const classification = score >= 75 ? 'Oportunidade' : score >= 55 ? 'Equilibrada' : 'Atenção';

    return {
      symbol: sym,
      name: item.name || sym,
      logo: item.logo || `https://icons.brapi.dev/icons/${sym}.svg`,
      sector: item.sector || 'B3',
      sectorRank: 1,
      price: item.price || null,
      change: item.change || 0,
      score,
      classification,
      breakdown: {
        valuation: Math.round(score * 0.9),
        profitability: Math.round(score * 0.95),
        dividend: Math.round(score * 0.85),
        debt: Math.round(score * 0.9),
        growth: Math.round(score * 0.8),
      },
      metrics: {
        pl: val.pl ?? null,
        pvp: val.pvp ?? null,
        dy: val.dividendYield ?? null,
        roe: rent.roe ?? null,
        roic: rent.roic ?? null,
        margemLiquida: rent.margemLiquida ?? null,
        dividaLiquidaEbitda: endiv.dividaLiquidaEbitda ?? null,
        crescimentoReceita: null,
        crescimentoLucro: null,
      },
      deteriorationFlags: risks.length > 1 ? risks : [],
      positives,
      risks,
      explanation: `Análise fundamentalista de referência baseada em balanços históricos CVM e múltiplos de mercado.`,
      criteria: { pl: val.pl, pvp: val.pvp, roe: rent.roe, dy: val.dividendYield },
      source: 'baseline-fundamental',
      updatedAt: new Date().toISOString(),
    };
  });

  list.sort((a, b) => b.score - a.score);
  return list;
}

// GET /api/intelligence/rankings — Python Quant Engine transparent rankings & deterioration alerts
router.get('/rankings', async (req, res) => {
  try {
    const rows = await db.allAsync(`
      SELECT q.*, a.name, a.logo, a.price, a.change_pct,
             f.pl, f.pvp, f.dy, f.roe, f.roic, f.margem_liquida,
             f.divida_liquida_ebitda, f.crescimento_receita, f.crescimento_lucro, f.source AS fund_source
      FROM quant_rankings q
      LEFT JOIN assets a ON a.symbol = q.symbol
      LEFT JOIN fundamentals f ON f.symbol = q.symbol
      ORDER BY q.score DESC
    `);

    let liveMap = new Map();
    try {
      const liveList = await getFullStockList(150);
      liveMap = new Map(liveList.map((s) => [s.stock.toUpperCase(), s]));
    } catch { }

    let rankings = [];

    if (rows && rows.length > 0) {
      rankings = rows.map((r) => {
        const live = liveMap.get(r.symbol.toUpperCase());
        const st = staticIndicators[r.symbol.toUpperCase()] || {};
        return {
          symbol: r.symbol,
          name: r.name || live?.name || st.name || r.symbol,
          logo: r.logo || live?.logo || `https://icons.brapi.dev/icons/${r.symbol}.svg`,
          sector: r.sector || st.sector || 'B3',
          sectorRank: r.sector_rank,
          price: live?.close ?? r.price ?? st.price ?? null,
          change: live?.change ?? r.change_pct ?? st.change ?? null,
          score: r.score,
          classification: r.classification,
          breakdown: {
            valuation: r.valuation_score,
            profitability: r.profitability_score,
            dividend: r.dividend_score,
            debt: r.debt_score,
            growth: r.growth_score,
          },
          metrics: {
            pl: r.pl,
            pvp: r.pvp,
            dy: r.dy,
            roe: r.roe,
            roic: r.roic,
            margemLiquida: r.margem_liquida,
            dividaLiquidaEbitda: r.divida_liquida_ebitda,
            crescimentoReceita: r.crescimento_receita,
            crescimentoLucro: r.crescimento_lucro,
          },
          deteriorationFlags: parseJson(r.deterioration_flags, []),
          positives: parseJson(r.positives, []),
          risks: parseJson(r.risks, []),
          explanation: r.explanation,
          criteria: parseJson(r.criteria_json, {}),
          source: r.fund_source || 'engine-python',
          updatedAt: r.updated_at,
        };
      });
    } else {
      // Fallback baseline for clean initial deployments until daily engine completes first sync
      rankings = buildFallbackRankings().map((r) => {
        const live = liveMap.get(r.symbol.toUpperCase());
        if (live) {
          if (live.close) r.price = live.close;
          if (typeof live.change === 'number') r.change = live.change;
          if (live.logo) r.logo = live.logo;
          if (live.name) r.name = live.name;
        }
        return r;
      });
    }

    const deteriorationAlerts = rankings.filter((r) => r.deteriorationFlags.length > 0);
    const sectors = [...new Set(rankings.map((r) => r.sector))].sort();

    res.json({
      count: rankings.length,
      sectors,
      updatedAt: rankings[0]?.updatedAt || null,
      disclaimer:
        'Análise quantitativa estritamente informativa baseada em indicadores históricos e cotações públicas. Não constitui recomendação personalizada de compra ou venda nem garantia de rentabilidade.',
      rankings,
      deteriorationAlerts,
    });
  } catch (err) {
    console.error('Error fetching quant rankings:', err.message);
    res.status(500).json({ error: 'Falha ao carregar ranking quantitativo' });
  }
});

// GET /api/intelligence/top-picks — Top 10 educational buy recommendations
router.get('/top-picks', async (req, res) => {
  try {
    // Try DB rankings first; fall back to buildFallbackRankings()
    const rows = await db.allAsync(`
      SELECT q.*, a.name, a.logo, a.price, a.change_pct,
             f.pl, f.pvp, f.dy, f.roe, f.roic, f.margem_liquida,
             f.divida_liquida_ebitda, f.crescimento_receita, f.crescimento_lucro, f.source AS fund_source
      FROM quant_rankings q
      LEFT JOIN assets a ON a.symbol = q.symbol
      LEFT JOIN fundamentals f ON f.symbol = q.symbol
      ORDER BY q.score DESC
      LIMIT 10
    `);

    let liveMap = new Map();
    try {
      const liveList = await getFullStockList(150);
      liveMap = new Map(liveList.map((s) => [s.stock.toUpperCase(), s]));
    } catch { }

    let picks = [];

    if (rows && rows.length > 0) {
      picks = rows.map((r) => {
        const live = liveMap.get(r.symbol.toUpperCase());
        const st = staticIndicators[r.symbol.toUpperCase()] || {};
        const price = live?.close ?? r.price ?? st.price ?? null;
        const metrics = {
          pl: r.pl ?? st.valuation?.pl ?? null,
          pvp: r.pvp ?? st.valuation?.pvp ?? null,
          dy: r.dy ?? st.valuation?.dividendYield ?? null,
          roe: r.roe ?? st.rentabilidade?.roe ?? null,
          roic: r.roic ?? st.rentabilidade?.roic ?? null,
          margemLiquida: r.margem_liquida ?? st.rentabilidade?.margemLiquida ?? null,
          dividaLiquidaEbitda: r.divida_liquida_ebitda ?? st.endividamento?.dividaLiquidaEbitda ?? null,
        };
        return {
          symbol: r.symbol,
          name: r.name || live?.name || st.name || r.symbol,
          logo: r.logo || live?.logo || `https://icons.brapi.dev/icons/${r.symbol}.svg`,
          sector: r.sector || st.sector || 'B3',
          price,
          change: live?.change ?? r.change_pct ?? st.change ?? null,
          score: r.score,
          metrics,
          projections: buildProjections(price, metrics, st),
          positives: parseJson(r.positives, []),
          risks: parseJson(r.risks, []),
          explanation: r.explanation || 'Análise baseada em fundamentos públicos da CVM e cotações de mercado.',
          learningPoints: buildLearningPoints(r, st),
          source: r.fund_source || 'engine-python',
          updatedAt: r.updated_at,
        };
      });
    } else {
      // Fallback: pick the top 10 from static indicators by score
      picks = buildFallbackRankings().slice(0, 10).map((r) => {
        const live = liveMap.get(r.symbol.toUpperCase());
        if (live) {
          if (live.close) r.price = live.close;
          if (typeof live.change === 'number') r.change = live.change;
          if (live.logo) r.logo = live.logo;
          if (live.name) r.name = live.name;
        }
        const st = staticIndicators[r.symbol.toUpperCase()] || {};
        r.metrics = {
          pl: st.valuation?.pl ?? r.metrics?.pl ?? null,
          pvp: st.valuation?.pvp ?? r.metrics?.pvp ?? null,
          dy: st.valuation?.dividendYield ?? r.metrics?.dy ?? null,
          roe: st.rentabilidade?.roe ?? r.metrics?.roe ?? null,
          roic: st.rentabilidade?.roic ?? r.metrics?.roic ?? null,
          margemLiquida: st.rentabilidade?.margemLiquida ?? r.metrics?.margemLiquida ?? null,
          dividaLiquidaEbitda: st.endividamento?.dividaLiquidaEbitda ?? r.metrics?.dividaLiquidaEbitda ?? null,
        };
        r.learningPoints = buildLearningPoints(r, st);
        r.projections = buildProjections(r.price, r.metrics, st);
        return r;
      });
    }

    res.json({
      count: picks.length,
      updatedAt: picks[0]?.updatedAt || new Date().toISOString(),
      disclaimer:
        'Lista educativa baseada em critérios quantitativos públicos. Não constitui recomendação de investimento.',
      picks,
    });
  } catch (err) {
    console.error('Error fetching top picks:', err.message);
    res.status(500).json({ error: 'Falha ao carregar recomendações de estudo' });
  }
});

function buildLearningPoints(r, st) {
  const points = [];
  const val = st?.valuation || {};
  const rent = st?.rentabilidade || {};
  const endiv = st?.endividamento || {};
  const pl = r.pl ?? val.pl;
  const dy = r.dy ?? val.dividendYield;
  const roe = r.roe ?? rent.roe;
  const divEbitda = r.divida_liquida_ebitda ?? endiv.dividaLiquidaEbitda;

  if (pl && pl > 0 && pl < 12) {
    points.push(`P/L de ${pl}x indica que o mercado precifica poucos anos de lucro — estude o que torna o valuation baixo e se é sustentável.`);
  } else if (pl && pl > 25) {
    points.push(`P/L de ${pl}x é elevado — investigue se o crescimento futuro justifica pagar mais por cada real de lucro.`);
  }
  if (dy && dy >= 6) {
    points.push(`Dividend Yield de ${dy}% mostra pagamento relevante de proventos — compare com a taxa Selic para entender o prêmio de risco.`);
  }
  if (roe && roe >= 15) {
    points.push(`ROE de ${roe}% demonstra eficiência em gerar lucro — analise se é recorrente ou pontual nos últimos 5 anos.`);
  }
  if (divEbitda != null && divEbitda <= 2) {
    points.push(`Dívida Líq./EBITDA de ${divEbitda}x indica endividamento controlado — observe se a empresa tem caixa ou se depende de dívida.`);
  } else if (divEbitda != null && divEbitda > 3.5) {
    points.push(`Dívida Líq./EBITDA de ${divEbitda}x é elevada — estude os riscos de alavancagem e os vencimentos da dívida.`);
  }
  if (points.length === 0) {
    points.push('Estude os balanços oficiais na CVM e compare com empresas do mesmo setor.');
  }
  points.push('Acesse a página do ativo para ver o gráfico histórico, preço justo (Graham/Bazin) e simulador de dividendos.');
  return points;
}

// ─────────────────────────────────────────────────────────────
// Projection engine — deterministic fundamental-based scenarios
// ─────────────────────────────────────────────────────────────

/**
 * Calculates Graham Intrinsic Value: VI = √(22.5 × LPA × VPA)
 * LPA = price / P/L ; VPA = price / P/VP
 */
function calcGraham(price, pl, pvp) {
  if (!price || !pl || pl <= 0 || !pvp || pvp <= 0) return null;
  const lpa = price / pl;
  const vpa = price / pvp;
  const vi = Math.sqrt(22.5 * lpa * vpa);
  return Number(vi.toFixed(2));
}

/**
 * Calculates Bazin Price Ceiling: Preço Teto = (DY% / 100 × price) / 0.06
 */
function calcBazin(price, dy) {
  if (!price || !dy || dy <= 0) return null;
  const annualDiv = (dy / 100) * price;
  return Number((annualDiv / 0.06).toFixed(2));
}

/**
 * Builds 3-scenario projections for 3M / 6M / 1Y horizons.
 *
 * Methodology (fully transparent):
 * 1. Graham Fair Value → target for P/L and P/VP reversion
 * 2. Bazin Fair Value → target for income-based valuation
 * 3. ROE-based equity growth → compounds book value over time
 * 4. DY contribution → total return including dividends
 * 5. Debt risk discount → higher leverage = wider bear range
 *
 * Scenarios:
 * - Bull (otimista): full reversion to fair value + growth premium
 * - Base (neutro):   partial reversion + organic growth only
 * - Bear (pessimista): no reversion + macro/debt risk haircut
 */
function buildProjections(price, metrics, st) {
  if (!price || price <= 0) return null;

  const val = st?.valuation || {};
  const rent = st?.rentabilidade || {};
  const endiv = st?.endividamento || {};

  const pl = metrics?.pl ?? val.pl;
  const pvp = metrics?.pvp ?? val.pvp;
  const dy = metrics?.dy ?? val.dividendYield ?? 0;
  const roe = metrics?.roe ?? rent.roe ?? 0;
  const divEbitda = metrics?.dividaLiquidaEbitda ?? endiv.dividaLiquidaEbitda;

  // 1. Fair values
  const graham = calcGraham(price, pl, pvp);
  const bazin = calcBazin(price, dy);

  // 2. Upside/downside to fair values
  const grahamUpside = graham ? (graham - price) / price : 0;
  const bazinUpside = bazin ? (bazin - price) / price : 0;
  // Blended fair-value signal (average of available)
  const fairTargets = [grahamUpside, bazinUpside].filter((v) => v !== 0);
  const avgFairUpside = fairTargets.length > 0
    ? fairTargets.reduce((a, b) => a + b, 0) / fairTargets.length
    : 0;

  // 3. Organic growth rate from ROE (equity compounds)
  const annualGrowth = roe > 0 ? (roe / 100) * (1 - (dy > 0 ? Math.min(dy / roe, 0.8) : 0.3)) : 0;

  // 4. Dividend contribution to total return
  const annualDivReturn = dy / 100;

  // 5. Risk factor from leverage
  let debtRisk = 0;
  if (divEbitda != null) {
    if (divEbitda > 4) debtRisk = 0.15;
    else if (divEbitda > 3) debtRisk = 0.10;
    else if (divEbitda > 2.5) debtRisk = 0.05;
  }
  // Negative P/L means company is losing money — extra risk
  const earningsRisk = (pl && pl < 0) ? 0.15 : 0;
  const totalRisk = debtRisk + earningsRisk;

  // 6. Build scenarios for each horizon
  const horizons = [
    { label: '3 meses', months: 3 },
    { label: '6 meses', months: 6 },
    { label: '1 ano', months: 12 },
  ];

  const scenarios = horizons.map((h) => {
    const t = h.months / 12; // fraction of year

    // Organic equity growth contribution (compounded)
    const organicGrowth = Math.pow(1 + annualGrowth, t) - 1;
    // Dividend income accumulated (simple, not reinvested)
    const divIncome = annualDivReturn * t;
    // Fair value reversion: assumes partial convergence over time
    // 3M → 20% reversion, 6M → 45%, 1Y → 75%
    const reversionFactor = h.months === 3 ? 0.20 : h.months === 6 ? 0.45 : 0.75;
    const reversionReturn = avgFairUpside * reversionFactor;

    // Bull: full organic + reversion + dividend + extra momentum
    const bull = reversionReturn + organicGrowth + divIncome + (organicGrowth * 0.3);
    // Base: half reversion + organic + dividend
    const base = (reversionReturn * 0.5) + organicGrowth + divIncome;
    // Bear: no positive reversion + risk discount + macro drag
    const bear = -totalRisk * t - (Math.abs(reversionReturn) * 0.3 * (avgFairUpside < 0 ? 1 : 0)) + (divIncome * 0.5);

    // Clamp to reasonable bounds (-60% to +120% per period)
    const clamp = (v) => Math.max(-0.60, Math.min(1.20, v));

    return {
      horizon: h.label,
      months: h.months,
      bull: {
        returnPct: Number((clamp(bull) * 100).toFixed(1)),
        price: Number((price * (1 + clamp(bull))).toFixed(2)),
      },
      base: {
        returnPct: Number((clamp(base) * 100).toFixed(1)),
        price: Number((price * (1 + clamp(base))).toFixed(2)),
      },
      bear: {
        returnPct: Number((clamp(bear) * 100).toFixed(1)),
        price: Number((price * (1 + clamp(bear))).toFixed(2)),
      },
    };
  });

  // Build methodology transparency
  const methods = [];
  if (graham) methods.push(`Graham (VI = √(22,5 × LPA × VPA)) → R$ ${graham.toFixed(2)}`);
  if (bazin) methods.push(`Bazin (Preço Teto = Div. Anual ÷ 6%) → R$ ${bazin.toFixed(2)}`);
  if (roe > 0) methods.push(`Crescimento orgânico via ROE de ${roe}% (retendo ${((1 - (dy > 0 ? Math.min(dy / roe, 0.8) : 0.3)) * 100).toFixed(0)}% dos lucros)`);
  if (dy > 0) methods.push(`Dividendos projetados: ${dy}% a.a.`);
  if (totalRisk > 0) methods.push(`Desconto de risco: ${(totalRisk * 100).toFixed(0)}% a.a. (alavancagem${earningsRisk > 0 ? ' + prejuízo' : ''})`);

  return {
    currentPrice: price,
    fairValue: {
      graham,
      bazin,
      avgUpside: Number((avgFairUpside * 100).toFixed(1)),
    },
    scenarios,
    methodology: methods,
  };
}

// GET /api/intelligence/projections — Fundamental-based price projections
router.get('/projections', async (req, res) => {
  try {
    // Fetch top-ranked assets
    const rows = await db.allAsync(`
      SELECT q.*, a.name, a.logo, a.price, a.change_pct,
             f.pl, f.pvp, f.dy, f.roe, f.roic, f.margem_liquida,
             f.divida_liquida_ebitda, f.crescimento_receita, f.crescimento_lucro, f.source AS fund_source
      FROM quant_rankings q
      LEFT JOIN assets a ON a.symbol = q.symbol
      LEFT JOIN fundamentals f ON f.symbol = q.symbol
      ORDER BY q.score DESC
      LIMIT 10
    `);

    let liveMap = new Map();
    try {
      const liveList = await getFullStockList(150);
      liveMap = new Map(liveList.map((s) => [s.stock.toUpperCase(), s]));
    } catch { }

    let assets = [];

    if (rows && rows.length > 0) {
      assets = rows.map((r) => {
        const live = liveMap.get(r.symbol.toUpperCase());
        const st = staticIndicators[r.symbol.toUpperCase()] || {};
        const price = live?.close ?? r.price ?? st.price ?? null;
        const metrics = {
          pl: r.pl ?? st.valuation?.pl,
          pvp: r.pvp ?? st.valuation?.pvp,
          dy: r.dy ?? st.valuation?.dividendYield,
          roe: r.roe ?? st.rentabilidade?.roe,
          roic: r.roic ?? st.rentabilidade?.roic,
          margemLiquida: r.margem_liquida ?? st.rentabilidade?.margemLiquida,
          dividaLiquidaEbitda: r.divida_liquida_ebitda ?? st.endividamento?.dividaLiquidaEbitda,
        };
        return {
          symbol: r.symbol,
          name: r.name || live?.name || st.name || r.symbol,
          logo: r.logo || live?.logo || `https://icons.brapi.dev/icons/${r.symbol}.svg`,
          sector: r.sector || st.sector || 'B3',
          score: r.score,
          metrics,
          projections: buildProjections(price, metrics, st),
        };
      });
    } else {
      // Fallback from static data
      assets = buildFallbackRankings().slice(0, 10).map((r) => {
        const live = liveMap.get(r.symbol.toUpperCase());
        const st = staticIndicators[r.symbol.toUpperCase()] || {};
        const price = live?.close ?? r.price ?? st.price ?? null;
        const metrics = {
          pl: st.valuation?.pl ?? null,
          pvp: st.valuation?.pvp ?? null,
          dy: st.valuation?.dividendYield ?? null,
          roe: st.rentabilidade?.roe ?? null,
          roic: st.rentabilidade?.roic ?? null,
          margemLiquida: st.rentabilidade?.margemLiquida ?? null,
          dividaLiquidaEbitda: st.endividamento?.dividaLiquidaEbitda ?? null,
        };
        return {
          symbol: r.symbol,
          name: r.name || st.name || r.symbol,
          logo: r.logo || st.logo || `https://icons.brapi.dev/icons/${r.symbol}.svg`,
          sector: r.sector || st.sector || 'B3',
          score: r.score,
          metrics,
          projections: buildProjections(price, metrics, st),
        };
      });
    }

    res.json({
      count: assets.length,
      updatedAt: new Date().toISOString(),
      methodologyOverview: [
        'Preço Justo Graham: VI = √(22,5 × LPA × VPA) — teto conservador para empresas lucrativas.',
        'Preço Teto Bazin: Dividendo Anual ÷ 6% — preço máximo para DY mínimo de 6%.',
        'Crescimento orgânico: ROE × taxa de retenção de lucros, composto no período.',
        'Dividendos: retorno acumulado de proventos projetados no horizonte.',
        'Risco: desconto proporcional ao endividamento (Dív.Líq/EBITDA) e prejuízo operacional.',
        'Cenário otimista: reversão plena ao valor justo + crescimento + dividendos.',
        'Cenário base: reversão parcial + crescimento orgânico + dividendos.',
        'Cenário pessimista: sem reversão positiva + desconto de risco + apenas parte dos dividendos.',
      ],
      disclaimer:
        'Projeções estritamente educativas baseadas em modelos fundamentalistas clássicos (Graham, Bazin) e indicadores públicos. ' +
        'O mercado é influenciado por fatores macroeconômicos, políticos e comportamentais não capturados neste modelo. ' +
        'Rentabilidade passada não garante resultados futuros. Não constitui recomendação de investimento.',
      assets,
    });
  } catch (err) {
    console.error('Error building projections:', err.message);
    res.status(500).json({ error: 'Falha ao calcular projeções' });
  }
});

// GET /api/intelligence/recommendations — Daily bot history & performance tracking
router.get('/recommendations', async (req, res) => {
  try {
    const rows = await db.allAsync(
      'SELECT * FROM bot_recommendations ORDER BY run_date DESC, score DESC LIMIT 100'
    );

    let liveMap = new Map();
    try {
      const liveList = await getFullStockList(150);
      liveMap = new Map(liveList.map((s) => [s.stock.toUpperCase(), s]));
    } catch { }

    const recommendations = rows.map((r) => {
      const livePrice = liveMap.get(r.symbol.toUpperCase())?.close ?? r.current_price;
      const computedReturn =
        livePrice && r.price_at_rec && r.price_at_rec > 0
          ? Number((((livePrice - r.price_at_rec) / r.price_at_rec) * 100).toFixed(2))
          : r.return_pct;

      return {
        id: r.id,
        runDate: r.run_date,
        symbol: r.symbol,
        assetType: r.asset_type,
        score: r.score,
        priceAtRec: r.price_at_rec,
        currentPrice: livePrice,
        returnPct: computedReturn,
        classification: r.classification,
        positives: parseJson(r.positives, []),
        risks: parseJson(r.risks, []),
        summary: r.summary,
        deliveredTelegram: Boolean(r.delivered_telegram),
        evaluatedAt: r.evaluated_at,
      };
    });

    const withReturn = recommendations.filter((r) => typeof r.returnPct === 'number');
    const avgReturnPct =
      withReturn.length > 0
        ? Number((withReturn.reduce((a, b) => a + b.returnPct, 0) / withReturn.length).toFixed(2))
        : null;
    const hitRatePct =
      withReturn.length > 0
        ? Number(((withReturn.filter((r) => r.returnPct > 0).length / withReturn.length) * 100).toFixed(1))
        : null;

    res.json({
      count: recommendations.length,
      performance: {
        evaluatedCount: withReturn.length,
        avgReturnPct,
        hitRatePct,
      },
      disclaimer:
        'Histórico informativo gerado pelo motor quantitativo para fins de estudo e avaliação de critérios. Rentabilidade passada não garante resultados futuros.',
      recommendations,
    });
  } catch (err) {
    console.error('Error fetching bot recommendations:', err.message);
    res.status(500).json({ error: 'Falha ao carregar histórico de sugestões' });
  }
});

// GET /api/intelligence/sector-peers/:symbol — Returns peer tickers from the same sector
router.get('/sector-peers/:symbol', async (req, res) => {
  try {
    const symbol = normalizeTicker(req.params.symbol);
    if (!symbol) return res.status(400).json({ error: 'Ticker inválido' });

    // Look in SQLite assets/quant_rankings first, fallback to staticIndicators
    const targetRow = await db.getAsync('SELECT sector FROM assets WHERE symbol = ?', [symbol]);
    const targetSector = targetRow?.sector || staticIndicators[symbol]?.sector;

    if (!targetSector) {
      return res.json({ symbol, sector: null, peers: [] });
    }

    const dbPeers = await db.allAsync(
      'SELECT symbol, name FROM assets WHERE sector = ? AND symbol != ? ORDER BY market_cap DESC LIMIT 6',
      [targetSector, symbol]
    );

    const staticPeers = Object.values(staticIndicators)
      .filter((s) => s.sector === targetSector && s.symbol !== symbol)
      .map((s) => ({ symbol: s.symbol, name: s.name }));

    const merged = new Map();
    for (const p of [...dbPeers, ...staticPeers]) {
      if (!merged.has(p.symbol)) merged.set(p.symbol, p);
    }

    res.json({
      symbol,
      sector: targetSector,
      peers: [...merged.values()].slice(0, 6),
    });
  } catch (err) {
    console.error('Error finding sector peers:', err.message);
    res.status(500).json({ error: 'Falha ao buscar pares do setor' });
  }
});

// POST /api/intelligence/run — Safely trigger Python Quant Engine from the Portal UI
router.post('/run', (req, res) => {
  const adminKey = (process.env.ADMIN_API_KEY || '').trim();
  const providedKey =
    req.headers['x-api-key'] ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : '');

  // Production requests must always carry the administrative key. In development,
  // loopback access is allowed for local operation without storing a secret.
  const isLoopback = process.env.NODE_ENV !== 'production' && isLoopbackIp(req.ip || req.socket?.remoteAddress);
  const hasAdminAccess = timingSafeEqualStr(providedKey, adminKey);
  if ((adminKey && !hasAdminAccess) || (!adminKey && !isLoopback)) {
    return res.status(401).json({ error: 'Chave administrativa inválida ou ausente.' });
  }

  if (engineRunning) {
    return res.status(409).json({ error: 'O motor quantitativo já está em execução. Aguarde concluir.' });
  }
  const elapsed = Date.now() - lastEngineRunAt;
  if (elapsed < ENGINE_COOLDOWN_MS) {
    const waitSec = Math.ceil((ENGINE_COOLDOWN_MS - elapsed) / 1000);
    return res.status(429).json({ error: `Aguarde ${waitSec}s antes de executar novamente.` });
  }

  if (process.env.VERCEL === '1') {
    return res.status(503).json({
      error: 'Na Vercel, o motor quantitativo Python roda automaticamente via GitHub Actions (workflow "Daily Quant Engine").',
    });
  }

  const scriptPath = path.resolve(__dirname, '../../../engine/run_daily.py');
  if (!fs.existsSync(scriptPath)) {
    return res.status(503).json({
      error: 'Execução sob demanda indisponível neste container. Em Docker, o serviço dedicado "engine" atualiza os dados automaticamente.',
    });
  }

  const allowPrivilegedFlags = hasAdminAccess || (!adminKey && isLoopback);
  const args = [scriptPath];
  if (req.body?.withCvm === true) args.push('--with-cvm');
  if (allowPrivilegedFlags && req.body?.sendTelegram === true) args.push('--send-telegram');
  if (allowPrivilegedFlags && req.body?.withAi === true) args.push('--with-ai');

  engineRunning = true;
  execFile('python3', args, { timeout: 60000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
    engineRunning = false;
    lastEngineRunAt = Date.now();
    if (err) {
      const code = err.code === 'ENOENT' ? 503 : 500;
      const msg =
        err.code === 'ENOENT'
          ? 'Python 3 não encontrado neste ambiente. Execute o serviço "engine" separadamente.'
          : 'Falha ao executar a atualização das análises.';
      console.error('Python engine run failed:', err.message, stderr);
      return res.status(code).json({ error: msg });
    }
    res.json({
      status: 'ok',
      ranAt: new Date().toISOString(),
      log: stdout.slice(0, 2000),
    });
  });
});

module.exports = router;

