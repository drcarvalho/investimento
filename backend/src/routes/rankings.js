const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { getStockList, getDetailedQuotes, getIndexes } = require('../services/brapi');

async function loadStocksFallback(limit = 20) {
  return db.allAsync(
    `SELECT symbol AS stock, name, logo, sector, price AS close, change_pct AS change, volume, market_cap
     FROM assets
     WHERE asset_type = 'stock' AND price IS NOT NULL
     ORDER BY COALESCE(market_cap, 0) DESC, COALESCE(volume, 0) DESC
     LIMIT ?`,
    [limit]
  );
}

// GET /api/rankings — real-time rankings from B3 (with SQLite fallback)
router.get('/', async (req, res) => {
  try {
    const [liveList, detailedQuotes, indexes] = await Promise.all([
      getStockList('market_cap_basic', 20).catch(() => []),
      getDetailedQuotes().catch(() => []),
      getIndexes().catch(() => []),
    ]);
    const stockList = liveList.length > 0 ? liveList : await loadStocksFallback(20);

    // Top 10 by market cap (from list endpoint)
    const valorMercado = stockList.slice(0, 10).map((s, i) => ({
      rank: i + 1,
      symbol: s.stock,
      name: s.name,
      logo: s.logo,
      sector: s.sector,
      value: formatMarketCap(s.market_cap),
      rawValue: s.market_cap,
      change: s.change,
      price: s.close,
    }));

    // Top movers (by absolute change %)
    const maioresAltas = [...stockList]
      .filter(s => s.change > 0)
      .sort((a, b) => b.change - a.change)
      .slice(0, 10)
      .map((s, i) => ({
        rank: i + 1,
        symbol: s.stock,
        name: s.name,
        logo: s.logo,
        sector: s.sector,
        value: `+${s.change.toFixed(2)}%`,
        rawValue: s.change,
        price: s.close,
      }));

    // Biggest losers
    const maioresBaixas = [...stockList]
      .filter(s => s.change < 0)
      .sort((a, b) => a.change - b.change)
      .slice(0, 10)
      .map((s, i) => ({
        rank: i + 1,
        symbol: s.stock,
        name: s.name,
        logo: s.logo,
        sector: s.sector,
        value: `${s.change.toFixed(2)}%`,
        rawValue: s.change,
        price: s.close,
      }));

    // Top by volume
    const maioresVolumes = [...stockList]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10)
      .map((s, i) => ({
        rank: i + 1,
        symbol: s.stock,
        name: s.name,
        logo: s.logo,
        sector: s.sector,
        value: formatVolume(s.volume),
        rawValue: s.volume,
        price: s.close,
        change: s.change,
      }));

    // Detailed quotes (PETR4, VALE3, ITUB4, MGLU3)
    const cotacoes = detailedQuotes.map(q => ({
      symbol: q.symbol,
      name: q.longName,
      logo: q.logourl,
      price: q.regularMarketPrice,
      change: q.regularMarketChangePercent,
      dayHigh: q.regularMarketDayHigh,
      dayLow: q.regularMarketDayLow,
      volume: q.regularMarketVolume,
      marketCap: q.marketCap,
      pe: q.priceEarnings,
      eps: q.earningsPerShare,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow,
      previousClose: q.regularMarketPreviousClose,
      updatedAt: q.regularMarketTime,
    }));

    res.json({
      updatedAt: new Date().toISOString(),
      indexes,
      cotacoes,
      valorMercado,
      maioresAltas,
      maioresBaixas,
      maioresVolumes,
    });
  } catch (err) {
    console.error('Error fetching rankings:', err.message);
    res.status(500).json({ error: 'Falha ao carregar rankings do mercado' });
  }
});

function formatMarketCap(value) {
  if (!value) return '—';
  if (value >= 1e12) return `R$ ${(value / 1e12).toFixed(2).replace('.', ',')} T`;
  if (value >= 1e9) return `R$ ${(value / 1e9).toFixed(2).replace('.', ',')} B`;
  if (value >= 1e6) return `R$ ${(value / 1e6).toFixed(2).replace('.', ',')} M`;
  return `R$ ${Number(value).toLocaleString('pt-BR')}`;
}

function formatVolume(value) {
  if (!value) return '—';
  if (value >= 1e6) return `${(value / 1e6).toFixed(2).replace('.', ',')} M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1).replace('.', ',')} K`;
  return Number(value).toLocaleString('pt-BR');
}

module.exports = router;
