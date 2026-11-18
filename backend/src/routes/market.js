const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { getStockList, getIndexes } = require('../services/brapi');

async function loadStocksFromDb(limit = 50) {
  const rows = await db.allAsync(
    `SELECT symbol AS stock, name, logo, sector, price AS close, change_pct AS change, volume, market_cap
     FROM assets
     WHERE asset_type = 'stock' AND price IS NOT NULL
     ORDER BY COALESCE(market_cap, 0) DESC, COALESCE(volume, 0) DESC
     LIMIT ?`,
    [limit]
  );
  return rows;
}

// GET /api/market — Market overview (with SQLite fallback if live upstream is unavailable)
router.get('/', async (req, res) => {
  try {
    let stockList = [];
    let indexes = [];
    try {
      [stockList, indexes] = await Promise.all([
        getStockList('market_cap_basic', 50),
        getIndexes().catch(() => []),
      ]);
    } catch {
      stockList = await loadStocksFromDb(50);
    }
    if (!stockList || stockList.length === 0) {
      stockList = await loadStocksFromDb(50);
    }

    const ibovespa = indexes.find(idx =>
      idx.name && (idx.name.includes('IBOV') || idx.name.includes('Ibovespa'))
    ) || indexes[0] || null;

    // Market-cap weighted average variation of top 50 B3 stocks (proxy when IBOV quote requires token)
    let weightedChangeSum = 0;
    let totalCap = 0;
    for (const s of stockList) {
      if (s.market_cap && typeof s.change === 'number') {
        weightedChangeSum += s.change * s.market_cap;
        totalCap += s.market_cap;
      }
    }
    const marketAvgChange = totalCap > 0 ? Number((weightedChangeSum / totalCap).toFixed(2)) : 0;

    const allByChange = [...stockList].sort((a, b) => (b.change || 0) - (a.change || 0));

    const topGainers = allByChange
      .filter(s => (s.change || 0) > 0)
      .slice(0, 5)
      .map(mapStock);

    const topLosers = allByChange
      .filter(s => (s.change || 0) < 0)
      .reverse()
      .slice(0, 5)
      .map(mapStock);

    const mostTraded = [...stockList]
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))
      .slice(0, 5)
      .map(mapStock);

    const topMarketCap = [...stockList]
      .slice(0, 5)
      .map(mapStock);

    // Top 18 stocks for Market Heatmap
    const heatmap = [...stockList]
      .slice(0, 18)
      .map(mapStock);

    const stocksUp = stockList.filter(s => (s.change || 0) > 0).length;
    const stocksDown = stockList.filter(s => (s.change || 0) < 0).length;
    const stocksFlat = stockList.filter(s => (s.change || 0) === 0).length;

    // Sector performance aggregation (ADVFN / TradingView style)
    const sectorBuckets = new Map();
    for (const s of stockList) {
      const rawSector = (s.sector || '').trim();
      if (!rawSector || typeof s.change !== 'number') continue;
      const label = SECTOR_LABELS[rawSector] || rawSector;
      if (!sectorBuckets.has(label)) {
        sectorBuckets.set(label, { sector: label, sum: 0, count: 0, up: 0, down: 0, leader: null });
      }
      const b = sectorBuckets.get(label);
      b.sum += s.change;
      b.count += 1;
      if (s.change > 0) b.up += 1;
      else if (s.change < 0) b.down += 1;
      if (!b.leader || s.change > b.leader.change) {
        b.leader = { symbol: s.stock, change: Number(s.change.toFixed(2)) };
      }
    }
    const sectors = [...sectorBuckets.values()]
      .map(b => ({
        sector: b.sector,
        avgChange: Number((b.sum / b.count).toFixed(2)),
        count: b.count,
        up: b.up,
        down: b.down,
        leader: b.leader,
      }))
      .sort((a, b) => b.avgChange - a.avgChange);

    res.json({
      updatedAt: new Date().toISOString(),
      ibovespa: {
        name: ibovespa?.name || 'IBOVESPA',
        symbol: ibovespa?.stock || '^BVSP',
        change: ibovespa?.variation ?? ibovespa?.change ?? marketAvgChange,
        isProxy: !(ibovespa?.variation != null || ibovespa?.change != null),
      },
      summary: {
        totalStocks: stockList.length,
        stocksUp,
        stocksDown,
        stocksFlat,
      },
      topGainers,
      topLosers,
      mostTraded,
      topMarketCap,
      heatmap,
      sectors,
    });
  } catch (err) {
    console.error('Error fetching market overview:', err.message);
    res.status(500).json({ error: 'Falha ao carregar dados do mercado' });
  }
});

const SECTOR_LABELS = {
  Finance: 'Financeiro & Bancos',
  'Energy Minerals': 'Petróleo & Energia',
  'Non-Energy Minerals': 'Mineração & Siderurgia',
  Utilities: 'Energia Elétrica & Saneamento',
  'Retail Trade': 'Varejo & Consumo',
  'Consumer Non-Durables': 'Consumo Não-Cíclico',
  'Consumer Durables': 'Bens de Consumo',
  'Consumer Services': 'Serviços ao Consumidor',
  'Industrial Services': 'Serviços Industriais',
  'Producer Manufacturing': 'Indústria & Manufatura',
  'Process Industries': 'Materiais Básicos',
  'Health Services': 'Saúde',
  'Health Technology': 'Tecnologia em Saúde',
  'Technology Services': 'Tecnologia',
  Communications: 'Telecomunicações',
  Transportation: 'Logística & Transportes',
  'Commercial Services': 'Serviços Comerciais',
  'Distribution Services': 'Distribuição',
  'Electronic Technology': 'Eletrônicos',
};

function mapStock(s) {
  return {
    symbol: s.stock,
    name: s.name,
    logo: s.logo,
    sector: s.sector,
    price: s.close,
    change: s.change,
    volume: s.volume,
    marketCap: s.market_cap,
  };
}

module.exports = router;
