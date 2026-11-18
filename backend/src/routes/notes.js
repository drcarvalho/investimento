const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { normalizeTicker, validateNotePayload } = require('../utils/validation');

// GET /api/notes — List all saved study notes
router.get('/', async (req, res) => {
  try {
    const rows = await db.allAsync(
      'SELECT symbol, thesis, risks, target_price, checklist, updated_at FROM stock_notes ORDER BY updated_at DESC LIMIT 100'
    );
    const parsed = rows.map((r) => ({
      ...r,
      checklist: safeParseJson(r.checklist, []),
    }));
    res.json(parsed);
  } catch (err) {
    console.error('Error listing notes:', err.message);
    res.status(500).json({ error: 'Falha ao consultar anotações' });
  }
});

// GET /api/notes/:symbol — Fetch study notes for a single ticker
router.get('/:symbol', async (req, res) => {
  const symbol = normalizeTicker(req.params.symbol);
  if (!symbol) {
    return res.status(400).json({ error: 'Ticker inválido' });
  }

  try {
    const row = await db.getAsync(
      'SELECT symbol, thesis, risks, target_price, checklist, updated_at FROM stock_notes WHERE symbol = ?',
      [symbol]
    );
    if (!row) {
      return res.json({
        symbol,
        thesis: '',
        risks: '',
        target_price: null,
        checklist: [],
        updated_at: null,
      });
    }
    res.json({
      ...row,
      checklist: safeParseJson(row.checklist, []),
    });
  } catch (err) {
    console.error('Error fetching note:', err.message);
    res.status(500).json({ error: 'Falha ao consultar anotação' });
  }
});

// PUT /api/notes/:symbol — Upsert validated study notes for a ticker
router.put('/:symbol', async (req, res) => {
  const symbol = normalizeTicker(req.params.symbol);
  if (!symbol) {
    return res.status(400).json({ error: 'Ticker inválido' });
  }

  const validation = validateNotePayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const { thesis, risks, target_price, checklist } = validation.data;
  const updatedAt = new Date().toISOString();
  const checklistStr = JSON.stringify(checklist);

  try {
    await db.runAsync(
      `INSERT INTO stock_notes (symbol, thesis, risks, target_price, checklist, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(symbol) DO UPDATE SET
         thesis = excluded.thesis,
         risks = excluded.risks,
         target_price = excluded.target_price,
         checklist = excluded.checklist,
         updated_at = excluded.updated_at`,
      [symbol, thesis, risks, target_price, checklistStr, updatedAt]
    );
    res.json({
      symbol,
      thesis,
      risks,
      target_price,
      checklist,
      updated_at: updatedAt,
    });
  } catch (err) {
    console.error('Error saving note:', err.message);
    res.status(500).json({ error: 'Falha ao salvar anotação' });
  }
});

function safeParseJson(str, fallback) {
  try {
    const val = JSON.parse(str);
    return Array.isArray(val) ? val : fallback;
  } catch {
    return fallback;
  }
}

module.exports = router;
