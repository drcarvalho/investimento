const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { getBrapiHeaders, getFullStockList, getFundsList } = require('../services/brapi');
const { getMacroIndicators } = require('../services/bcb');
const { normalizeTicker, sanitizeSearchQuery } = require('../utils/validation');
const { withTimeout } = require('../utils/async');

// GET /api/macro — Banco Central SGS macro indicators (Selic, IPCA, PTAX USD)
router.get('/macro', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    const data = await getMacroIndicators({ forceRefresh });
    res.json(data);
  } catch (err) {
    console.error('Error loading macro indicators:', err.message);
    res.status(500).json({ error: 'Falha ao carregar indicadores macroeconômicos' });
  }
});

// GET /api/assets?type=stock|fii|etf&q=TERM — Unified B3 Asset Explorer
router.get('/assets', async (req, res) => {
  try {
    const type = ['stock', 'fii', 'etf'].includes(req.query.type) ? req.query.type : 'fii';
    const q = sanitizeSearchQuery(req.query.q).toUpperCase();

    let items = [];
    if (type === 'stock') {
      const list = await withTimeout(getFullStockList(120), 6500, []);
      items = list.map((s) => ({
        symbol: s.stock,
        name: s.name || s.stock,
        assetType: 'stock',
        sector: s.sector || 'Ações B3',
        price: s.close,
        change: s.change ?? 0,
        volume: s.volume ?? 0,
        marketCap: s.market_cap ?? null,
        logo: s.logo || `https://icons.brapi.dev/icons/${s.stock}.svg`,
      }));
    } else {
      items = await withTimeout(getFundsList(type, 80), 6500, []);
    }

    // Fallback to persisted DB assets table if live brapi list is temporarily unavailable
    if (items.length === 0) {
      const dbAssets = await withTimeout(
        db.allAsync(
          `SELECT symbol, name, asset_type, sector, logo, price, change_pct, volume, market_cap
           FROM assets
           WHERE asset_type = ?
           ORDER BY COALESCE(volume, 0) DESC, COALESCE(market_cap, 0) DESC
           LIMIT 80`,
          [type]
        ),
        3000,
        []
      );
      items = dbAssets.map((a) => ({
        symbol: a.symbol,
        name: a.name || a.symbol,
        assetType: a.asset_type || type,
        sector: a.sector || (type === 'fii' ? 'Fundos Imobiliários' : type === 'etf' ? 'ETFs' : 'Ações B3'),
        price: a.price ?? null,
        change: a.change_pct ?? null,
        volume: a.volume ?? 0,
        marketCap: a.market_cap ?? null,
        logo: a.logo || `https://icons.brapi.dev/icons/${a.symbol}.svg`,
      }));
    }

    // Merge persisted fundamentals safely (never fail the whole response if DB is slow/offline)
    const symbols = [...new Set(items.map((i) => i.symbol.toUpperCase()))];
    let fundRows = [];
    if (symbols.length > 0) {
      const placeholders = symbols.map(() => '?').join(',');
      fundRows = await withTimeout(
        db.allAsync(
          `SELECT symbol, dy, pvp, pl, roe, source FROM fundamentals WHERE symbol IN (${placeholders})`,
          symbols
        ),
        3000,
        []
      );
    }
    const fundMap = new Map(fundRows.map((r) => [r.symbol.toUpperCase(), r]));

    items = items.map((item) => {
      const f = fundMap.get(item.symbol.toUpperCase());
      return {
        ...item,
        dy: f?.dy ?? null,
        pvp: f?.pvp ?? null,
        pl: f?.pl ?? null,
        roe: f?.roe ?? null,
        fundamentalSource: f?.source ?? null,
      };
    });

    if (q) {
      items = items.filter(
        (i) =>
          i.symbol.toUpperCase().includes(q) ||
          (i.name || '').toUpperCase().includes(q) ||
          (i.sector || '').toUpperCase().includes(q)
      );
    }

    res.json({
      type,
      count: items.length,
      updatedAt: new Date().toISOString(),
      assets: items,
    });
  } catch (err) {
    console.error('Error listing assets:', err.message);
    res.status(500).json({ error: 'Falha ao carregar lista de ativos' });
  }
});

// GET /api/assets/:symbol/dividends — Real persisted dividends + annual summary (never invented)
router.get('/assets/:symbol/dividends', async (req, res) => {
  try {
    const symbol = normalizeTicker(req.params.symbol);
    if (!symbol) return res.status(400).json({ error: 'Ticker inválido' });

    let rows = await db.allAsync(
      'SELECT symbol, pay_date, amount, type, source FROM dividends WHERE symbol = ? ORDER BY pay_date DESC LIMIT 120',
      [symbol]
    );

    // On-demand live fetch from brapi if empty and symbol is free or BRAPI_TOKEN is configured
    const freeSet = new Set(['PETR4', 'VALE3', 'ITUB4', 'MGLU3']);
    if (rows.length === 0 && (freeSet.has(symbol) || process.env.BRAPI_TOKEN)) {
      try {
        const resp = await fetch(`https://brapi.dev/api/quote/${encodeURIComponent(symbol)}?dividends=true`, {
          signal: AbortSignal.timeout(8000),
          headers: getBrapiHeaders(),
        });
        if (resp.ok) {
          const json = await resp.json();
          const cash = json.results?.[0]?.dividendsData?.cashDividends || [];
          if (cash.length > 0) {
            const parsedDividends = cash
              .map((d) => {
                const rawDate = d.paymentDate || d.lastDatePrior || d.exDate;
                if (!rawDate || typeof d.rate !== 'number' || d.rate <= 0) return null;
                return {
                  pay_date: String(rawDate).slice(0, 10),
                  amount: Number(d.rate.toFixed(6)),
                  type: (d.label || 'DIVIDENDO').toUpperCase(),
                  source: 'brapi-live',
                };
              })
              .filter(Boolean);
            await db.upsertDividends(symbol, parsedDividends);
            rows = await db.allAsync(
              'SELECT symbol, pay_date, amount, type, source FROM dividends WHERE symbol = ? ORDER BY pay_date DESC LIMIT 120',
              [symbol]
            );
          }
        }
      } catch (e) {
        console.warn(`On-demand dividends fetch failed for ${symbol}:`, e.message);
      }
    }

    const total12m = rows
      .filter((r) => {
        const d = new Date(r.pay_date);
        return !isNaN(d.getTime()) && Date.now() - d.getTime() <= 366 * 24 * 60 * 60 * 1000;
      })
      .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

    // Aggregate by year for bar chart
    const yearMap = new Map();
    for (const r of rows) {
      const yr = String(r.pay_date || '').slice(0, 4);
      if (/^\d{4}$/.test(yr)) {
        yearMap.set(yr, (yearMap.get(yr) || 0) + (Number(r.amount) || 0));
      }
    }
    const byYear = [...yearMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8)
      .map(([year, total]) => ({ year, total: Number(total.toFixed(4)) }));

    res.json({
      symbol,
      count: rows.length,
      total12m: rows.length > 0 ? Number(total12m.toFixed(4)) : null,
      byYear,
      dividends: rows,
    });
  } catch (err) {
    console.error('Error loading dividends:', err.message);
    res.status(500).json({ error: 'Falha ao consultar dividendos' });
  }
});

// GET /api/assets/:symbol/events — Official CVM IPE Fatos Relevantes & Comunicados
router.get('/assets/:symbol/events', async (req, res) => {
  try {
    const symbol = normalizeTicker(req.params.symbol);
    if (!symbol) return res.status(400).json({ error: 'Ticker inválido' });

    const rows = await db.allAsync(
      `SELECT symbol, event_date, category, subject, link, source, updated_at
       FROM corporate_events
       WHERE symbol = ?
       ORDER BY event_date DESC
       LIMIT 30`,
      [symbol]
    );

    res.json({
      symbol,
      count: rows.length,
      events: rows.map((r) => ({
        date: r.event_date,
        category: r.category,
        subject: r.subject,
        link: r.link || null,
        source: r.source || 'CVM IPE',
      })),
    });
  } catch (err) {
    console.error('Error loading corporate events:', err.message);
    res.status(500).json({ error: 'Falha ao consultar comunicados oficiais da CVM' });
  }
});

module.exports = router;

