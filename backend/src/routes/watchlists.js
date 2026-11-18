const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { normalizeTicker } = require('../utils/validation');

// GET /api/watchlists — List all watchlists with their tickers
router.get('/', async (req, res) => {
  try {
    const lists = await db.allAsync('SELECT id, name, created_at FROM watchlists ORDER BY id ASC');
    const items = await db.allAsync(
      'SELECT watchlist_id, symbol, added_at FROM watchlist_items ORDER BY added_at DESC'
    );

    const byList = new Map();
    for (const item of items) {
      if (!byList.has(item.watchlist_id)) byList.set(item.watchlist_id, []);
      byList.get(item.watchlist_id).push(item.symbol);
    }

    res.json(
      lists.map((l) => ({
        ...l,
        symbols: byList.get(l.id) || [],
      }))
    );
  } catch (err) {
    console.error('Error fetching watchlists:', err.message);
    res.status(500).json({ error: 'Falha ao carregar listas de acompanhamento' });
  }
});

const MAX_WATCHLISTS = 25;
const MAX_ITEMS_PER_LIST = 100;

// POST /api/watchlists — Create a new custom watchlist
router.post('/', async (req, res) => {
  try {
    const rawName = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 60) : '';
    if (!rawName || rawName.length < 2) {
      return res.status(400).json({ error: 'Nome da lista deve ter entre 2 e 60 caracteres' });
    }
    const countRow = await db.getAsync('SELECT COUNT(*) AS total FROM watchlists');
    if (Number(countRow?.total || 0) >= MAX_WATCHLISTS) {
      return res.status(400).json({ error: `Limite máximo de ${MAX_WATCHLISTS} listas atingido.` });
    }
    const now = new Date().toISOString();
    const result = await db.runAsync(
      'INSERT INTO watchlists (name, created_at) VALUES (?, ?)',
      [rawName, now]
    );
    res.status(201).json({ id: result.lastID, name: rawName, created_at: now, symbols: [] });
  } catch (err) {
    if (err.code === '23505' || (err.message && /UNIQUE|duplicate key/i.test(err.message))) {
      return res.status(409).json({ error: 'Já existe uma lista com esse nome' });
    }
    res.status(500).json({ error: 'Falha ao criar lista' });
  }
});

// DELETE /api/watchlists/:id — Delete a custom watchlist (protects default id=1)
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 1) {
      return res.status(400).json({ error: 'A lista principal não pode ser removida' });
    }
    const result = await db.runAsync('DELETE FROM watchlists WHERE id = ?', [id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }
    res.json({ deleted: id });
  } catch {
    res.status(500).json({ error: 'Falha ao remover lista' });
  }
});

// POST /api/watchlists/:id/items — Add ticker to watchlist
router.post('/:id/items', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const symbol = normalizeTicker(req.body?.symbol);
    if (!Number.isInteger(id) || id < 1 || !symbol) {
      return res.status(400).json({ error: 'Lista ou ticker inválido' });
    }
    const list = await db.getAsync('SELECT id FROM watchlists WHERE id = ?', [id]);
    if (!list) return res.status(404).json({ error: 'Lista não encontrada' });

    const itemCount = await db.getAsync(
      'SELECT COUNT(*) AS total FROM watchlist_items WHERE watchlist_id = ?',
      [id]
    );
    if (Number(itemCount?.total || 0) >= MAX_ITEMS_PER_LIST) {
      return res.status(400).json({ error: `Limite máximo de ${MAX_ITEMS_PER_LIST} ativos por lista atingido.` });
    }

    await db.runAsync(
      `INSERT INTO watchlist_items (watchlist_id, symbol, added_at)
       VALUES (?, ?, ?)
       ON CONFLICT (watchlist_id, symbol) DO NOTHING`,
      [id, symbol, new Date().toISOString()]
    );
    res.status(201).json({ watchlist_id: id, symbol });
  } catch {
    res.status(500).json({ error: 'Falha ao adicionar ativo na lista' });
  }
});

// DELETE /api/watchlists/:id/items/:symbol — Remove ticker from watchlist
router.delete('/:id/items/:symbol', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const symbol = normalizeTicker(req.params.symbol);
    if (!Number.isInteger(id) || id < 1 || !symbol) {
      return res.status(400).json({ error: 'Lista ou ticker inválido' });
    }
    await db.runAsync(
      'DELETE FROM watchlist_items WHERE watchlist_id = ? AND symbol = ?',
      [id, symbol]
    );
    res.json({ watchlist_id: id, removed: symbol });
  } catch {
    res.status(500).json({ error: 'Falha ao remover ativo da lista' });
  }
});

module.exports = router;

