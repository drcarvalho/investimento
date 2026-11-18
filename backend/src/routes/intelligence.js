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
    } catch {}

    const rankings = rows.map((r) => {
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
    } catch {}

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

