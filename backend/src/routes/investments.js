const express = require('express');
const router = express.Router();
const db = require('../models/db');
const staticIndicators = require('../data/indicators-static.json');
const { getFullStockList, getFundsList } = require('../services/brapi');
const { normalizeTicker } = require('../utils/validation');

function validatePositionFields(body) {
  const quantity = Number(body?.quantity);
  const avgPrice = Number(body?.avg_price);

  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e8 || !Number.isInteger(quantity)) {
    return { error: 'Quantidade deve ser um número inteiro positivo (máx. 100.000.000).' };
  }
  if (!Number.isFinite(avgPrice) || avgPrice <= 0 || avgPrice > 1e7) {
    return { error: 'Preço médio deve ser um número positivo válido.' };
  }
  return {
    quantity,
    avgPrice: Number(avgPrice.toFixed(4)),
  };
}

async function enrichPositions(rows) {
  if (!rows || rows.length === 0) {
    return {
      positions: [],
      summary: {
        assetCount: 0,
        totalCost: 0,
        totalValue: 0,
        totalProfitLoss: 0,
        totalProfitLossPct: null,
        estimatedAnnualDividends: 0,
        estimatedMonthlyDividends: 0,
      },
      bySector: [],
    };
  }

  const symbols = [...new Set(rows.map((r) => String(r.symbol).toUpperCase()))];
  const placeholders = symbols.map(() => '?').join(',');

  const [assetRows, fundRows] = await Promise.all([
    db.allAsync(
      `SELECT symbol, name, asset_type, sector, logo, price, change_pct FROM assets WHERE symbol IN (${placeholders})`,
      symbols
    ),
    db.allAsync(
      `SELECT symbol, dy FROM fundamentals WHERE symbol IN (${placeholders})`,
      symbols
    ),
  ]);

  const assetMap = new Map(assetRows.map((a) => [a.symbol.toUpperCase(), a]));
  const fundMap = new Map(fundRows.map((f) => [f.symbol.toUpperCase(), f]));

  // Best-effort live market quotes (never blocks if offline)
  const liveMap = new Map();
  try {
    const [stocks, funds] = await Promise.all([
      getFullStockList(150).catch(() => []),
      getFundsList('all', 100).catch(() => []),
    ]);
    for (const s of stocks) {
      if (s?.stock) liveMap.set(s.stock.toUpperCase(), { price: s.close, change: s.change, name: s.name, sector: s.sector, logo: s.logo });
    }
    for (const f of funds) {
      if (f?.symbol) liveMap.set(f.symbol.toUpperCase(), { price: f.price, change: f.change, name: f.name, sector: f.sector, logo: f.logo });
    }
  } catch {}

  let totalCost = 0;
  let totalValue = 0;
  let valuedCost = 0;
  let estimatedAnnualDividends = 0;
  const sectorTotals = new Map();

  const positions = rows.map((r) => {
    const sym = String(r.symbol).toUpperCase();
    const live = liveMap.get(sym);
    const asset = assetMap.get(sym);
    const fund = fundMap.get(sym);
    const st = staticIndicators[sym] || {};

    const currentPrice =
      (typeof live?.price === 'number' && live.price > 0 ? live.price : null) ??
      (typeof asset?.price === 'number' && asset.price > 0 ? asset.price : null) ??
      (typeof r.current_price === 'number' && r.current_price > 0 ? r.current_price : null) ??
      (typeof st.price === 'number' && st.price > 0 ? st.price : null);

    const dy =
      (typeof fund?.dy === 'number' && fund.dy >= 0 ? fund.dy : null) ??
      (typeof st.valuation?.dividendYield === 'number' ? st.valuation.dividendYield : null);

    const cost = Number((r.quantity * r.avg_price).toFixed(2));
    const currentValue = currentPrice != null ? Number((r.quantity * currentPrice).toFixed(2)) : null;
    const profitLoss = currentValue != null ? Number((currentValue - cost).toFixed(2)) : null;
    const profitLossPct =
      profitLoss != null && cost > 0 ? Number(((profitLoss / cost) * 100).toFixed(2)) : null;

    const estAnnualDiv =
      currentValue != null && dy != null && dy > 0
        ? Number(((currentValue * dy) / 100).toFixed(2))
        : null;

    const sector = asset?.sector || live?.sector || st.sector || 'Outros';

    totalCost += cost;
    if (currentValue != null) {
      totalValue += currentValue;
      valuedCost += cost;
      sectorTotals.set(sector, (sectorTotals.get(sector) || 0) + currentValue);
    } else {
      sectorTotals.set(sector, (sectorTotals.get(sector) || 0) + cost);
    }
    if (estAnnualDiv != null) {
      estimatedAnnualDividends += estAnnualDiv;
    }

    return {
      id: r.id,
      symbol: sym,
      name: asset?.name || live?.name || st.name || sym,
      asset_type: asset?.asset_type || (sym.endsWith('11') ? 'fii' : 'stock'),
      sector,
      logo: asset?.logo || live?.logo || `https://icons.brapi.dev/icons/${sym}.svg`,
      quantity: r.quantity,
      avg_price: r.avg_price,
      current_price: currentPrice,
      day_change: live?.change ?? asset?.change_pct ?? null,
      dy,
      total_cost: cost,
      current_value: currentValue,
      profit_loss: profitLoss,
      profit_loss_pct: profitLossPct,
      estimated_annual_dividend: estAnnualDiv,
    };
  });

  const totalSectorBasis = [...sectorTotals.values()].reduce((acc, v) => acc + v, 0) || 1;
  const bySector = [...sectorTotals.entries()]
    .map(([sector, value]) => ({
      sector,
      value: Number(value.toFixed(2)),
      pct: Number(((value / totalSectorBasis) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.value - a.value);

  const totalProfitLoss = valuedCost > 0 ? Number((totalValue - valuedCost).toFixed(2)) : null;
  const totalProfitLossPct =
    totalProfitLoss != null && valuedCost > 0
      ? Number(((totalProfitLoss / valuedCost) * 100).toFixed(2))
      : null;

  return {
    positions,
    summary: {
      assetCount: positions.length,
      totalCost: Number(totalCost.toFixed(2)),
      totalValue: valuedCost > 0 ? Number(totalValue.toFixed(2)) : null,
      totalProfitLoss,
      totalProfitLossPct,
      estimatedAnnualDividends: Number(estimatedAnnualDividends.toFixed(2)),
      estimatedMonthlyDividends: Number((estimatedAnnualDividends / 12).toFixed(2)),
    },
    bySector,
  };
}

// GET /api/investments — Backward-compatible list of positions enriched with live prices
router.get('/', async (req, res) => {
  try {
    const rows = await db.allAsync(
      'SELECT id, symbol, quantity, avg_price, current_price FROM investments ORDER BY symbol ASC'
    );
    const { positions } = await enrichPositions(rows);
    res.json(positions);
  } catch (err) {
    console.error('DB error listing investments:', err.message);
    res.status(500).json({ error: 'Falha ao carregar carteira' });
  }
});

// GET /api/investments/summary — Consolidated portfolio metrics, positions, and sector allocation
router.get('/summary', async (req, res) => {
  try {
    const rows = await db.allAsync(
      'SELECT id, symbol, quantity, avg_price, current_price FROM investments ORDER BY symbol ASC'
    );
    const enriched = await enrichPositions(rows);
    res.json({
      ...enriched,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('DB error loading portfolio summary:', err.message);
    res.status(500).json({ error: 'Falha ao calcular resumo da carteira' });
  }
});

// POST /api/investments — Add a position (consolidates weighted average price if symbol already exists)
router.post('/', async (req, res) => {
  try {
    const symbol = normalizeTicker(req.body?.symbol);
    if (!symbol) {
      return res.status(400).json({ error: 'Ticker inválido (ex: PETR4, ITUB4, MXRF11).' });
    }
    const validated = validatePositionFields(req.body);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    const consolidate = req.body?.consolidate !== false;
    const existing = consolidate
      ? await db.getAsync(
          'SELECT id, symbol, quantity, avg_price FROM investments WHERE UPPER(symbol) = ? ORDER BY id ASC LIMIT 1',
          [symbol]
        )
      : null;

    if (existing) {
      const newQty = existing.quantity + validated.quantity;
      const newAvg = Number(
        (
          (existing.quantity * existing.avg_price + validated.quantity * validated.avgPrice) /
          newQty
        ).toFixed(4)
      );
      await db.runAsync('UPDATE investments SET quantity = ?, avg_price = ? WHERE id = ?', [
        newQty,
        newAvg,
        existing.id,
      ]);
      return res.status(200).json({
        id: existing.id,
        symbol,
        quantity: newQty,
        avg_price: newAvg,
        consolidated: true,
      });
    }

    const result = await db.runAsync(
      'INSERT INTO investments (symbol, quantity, avg_price, current_price) VALUES (?, ?, ?, NULL)',
      [symbol, validated.quantity, validated.avgPrice]
    );
    res.status(201).json({
      id: result.lastID,
      symbol,
      quantity: validated.quantity,
      avg_price: validated.avgPrice,
      consolidated: false,
    });
  } catch (err) {
    console.error('Error saving investment:', err.message);
    res.status(500).json({ error: 'Falha ao adicionar ativo à carteira' });
  }
});

// PUT /api/investments/:id — Update exact quantity and average price of a position
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de posição inválido.' });
    }
    const validated = validatePositionFields(req.body);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    const result = await db.runAsync(
      'UPDATE investments SET quantity = ?, avg_price = ? WHERE id = ?',
      [validated.quantity, validated.avgPrice, id]
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Posição não encontrada.' });
    }
    res.json({ id, quantity: validated.quantity, avg_price: validated.avgPrice });
  } catch (err) {
    console.error('Error updating investment:', err.message);
    res.status(500).json({ error: 'Falha ao atualizar posição' });
  }
});

// DELETE /api/investments/:id — Remove position from portfolio
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de posição inválido.' });
    }
    const result = await db.runAsync('DELETE FROM investments WHERE id = ?', [id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Posição não encontrada.' });
    }
    res.json({ deleted: true, id });
  } catch (err) {
    console.error('Error deleting investment:', err.message);
    res.status(500).json({ error: 'Falha ao remover posição' });
  }
});

module.exports = router;
