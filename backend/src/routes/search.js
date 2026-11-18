const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { getFullStockList, getFundsList } = require('../services/brapi');
const { sanitizeSearchQuery } = require('../utils/validation');
const staticIndicators = require('../data/indicators-static.json');

// GET /api/search?q=TERM — Searches Stocks, FIIs and ETFs on B3 (with SQLite fallback)
router.get('/', async (req, res) => {
  try {
    const cleanQuery = sanitizeSearchQuery(req.query.q);
    const query = cleanQuery.toUpperCase();

    if (!query) {
      return res.json({ query: '', count: 0, results: [] });
    }

    const [stocks, funds, fundSymbolsRows] = await Promise.all([
      getFullStockList(150).catch(() => []),
      getFundsList('all', 120).catch(() => []),
      db.allAsync('SELECT symbol FROM fundamentals').catch(() => []),
    ]);

    const dbFundSet = new Set(fundSymbolsRows.map((r) => String(r.symbol).toUpperCase()));

    let normalized = [
      ...stocks.map((s) => {
        const sym = (s.stock || '').toUpperCase();
        return {
          symbol: s.stock,
          name: s.name || s.stock,
          assetType: 'stock',
          logo: s.logo,
          sector: s.sector || 'Ações B3',
          price: s.close,
          change: s.change,
          marketCap: s.market_cap,
          volume: s.volume,
          hasFundamentals: Boolean(staticIndicators[sym] || dbFundSet.has(sym)),
        };
      }),
      ...funds.map((f) => {
        const sym = (f.symbol || '').toUpperCase();
        return {
          symbol: f.symbol,
          name: f.name,
          assetType: f.assetType,
          logo: f.logo,
          sector: f.sector,
          price: f.price,
          change: f.change,
          marketCap: f.marketCap,
          volume: f.volume,
          hasFundamentals: dbFundSet.has(sym),
        };
      }),
    ];

    // Fallback to persisted SQLite assets when live upstream is temporarily unavailable
    if (normalized.length === 0) {
      const dbAssets = await db.allAsync(
        `SELECT symbol, name, asset_type, logo, sector, price, change_pct, market_cap, volume
         FROM assets
         ORDER BY COALESCE(market_cap, 0) DESC, COALESCE(volume, 0) DESC
         LIMIT 300`
      );
      normalized = dbAssets.map((a) => {
        const sym = (a.symbol || '').toUpperCase();
        return {
          symbol: a.symbol,
          name: a.name || a.symbol,
          assetType: a.asset_type || 'stock',
          logo: a.logo || `https://icons.brapi.dev/icons/${sym}.svg`,
          sector: a.sector || 'B3',
          price: a.price,
          change: a.change_pct,
          marketCap: a.market_cap,
          volume: a.volume,
          hasFundamentals: Boolean(staticIndicators[sym] || dbFundSet.has(sym)),
        };
      });
    }

    const matches = normalized
      .filter((item) => {
        const ticker = (item.symbol || '').toUpperCase();
        const name = (item.name || '').toUpperCase();
        const sector = (item.sector || '').toUpperCase();
        const type = (item.assetType || '').toUpperCase();
        return (
          ticker.includes(query) ||
          name.includes(query) ||
          sector.includes(query) ||
          type === query
        );
      })
      .slice(0, 25);

    res.json({
      query: cleanQuery,
      count: matches.length,
      results: matches,
    });
  } catch (err) {
    console.error('Error in search:', err.message);
    res.status(500).json({ error: 'Falha ao buscar ativos' });
  }
});

module.exports = router;
