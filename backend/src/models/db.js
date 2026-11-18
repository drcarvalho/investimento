const path = require('path');
const fs = require('fs');

function isPostgresUrl(url) {
  return typeof url === 'string' && /^postgres(ql)?:\/\//i.test(url.trim());
}

// Convert SQLite-style `?` placeholders to PostgreSQL `$1, $2, ...` outside single-quoted literals
function convertPlaceholders(sql) {
  let out = '';
  let idx = 0;
  let inSingleQuote = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'") {
      if (inSingleQuote && sql[i + 1] === "'") {
        out += "''";
        i += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      out += ch;
    } else if (ch === '?' && !inSingleQuote) {
      idx += 1;
      out += `$${idx}`;
    } else {
      out += ch;
    }
  }
  return out;
}

const PG_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS investments (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    avg_price DOUBLE PRECISION NOT NULL,
    current_price DOUBLE PRECISION
  )`,
  `CREATE TABLE IF NOT EXISTS stock_notes (
    symbol TEXT PRIMARY KEY,
    thesis TEXT DEFAULT '',
    risks TEXT DEFAULT '',
    target_price DOUBLE PRECISION,
    checklist TEXT DEFAULT '[]',
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS assets (
    symbol TEXT PRIMARY KEY,
    name TEXT,
    asset_type TEXT DEFAULT 'stock',
    sector TEXT,
    subsector TEXT,
    cnpj TEXT,
    logo TEXT,
    price DOUBLE PRECISION,
    change_pct DOUBLE PRECISION,
    volume DOUBLE PRECISION,
    market_cap DOUBLE PRECISION,
    source TEXT,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS fundamentals (
    symbol TEXT PRIMARY KEY,
    pl DOUBLE PRECISION,
    pvp DOUBLE PRECISION,
    ev_ebitda DOUBLE PRECISION,
    dy DOUBLE PRECISION,
    roe DOUBLE PRECISION,
    roa DOUBLE PRECISION,
    roic DOUBLE PRECISION,
    margem_liquida DOUBLE PRECISION,
    margem_ebitda DOUBLE PRECISION,
    divida_liquida DOUBLE PRECISION,
    divida_liquida_ebitda DOUBLE PRECISION,
    divida_liquida_pl DOUBLE PRECISION,
    crescimento_receita DOUBLE PRECISION,
    crescimento_lucro DOUBLE PRECISION,
    receita_liquida DOUBLE PRECISION,
    lucro_liquido DOUBLE PRECISION,
    patrimonio_liquido DOUBLE PRECISION,
    source TEXT,
    reference_date TEXT,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS price_history (
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    open DOUBLE PRECISION,
    high DOUBLE PRECISION,
    low DOUBLE PRECISION,
    close DOUBLE PRECISION NOT NULL,
    volume DOUBLE PRECISION,
    source TEXT,
    PRIMARY KEY (symbol, date)
  )`,
  `CREATE TABLE IF NOT EXISTS dividends (
    symbol TEXT NOT NULL,
    pay_date TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    type TEXT DEFAULT 'DIVIDENDO',
    source TEXT,
    PRIMARY KEY (symbol, pay_date, type)
  )`,
  `CREATE TABLE IF NOT EXISTS macro_indicators (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    unit TEXT,
    ref_date TEXT,
    source TEXT,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS watchlists (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS watchlist_items (
    watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    added_at TEXT,
    PRIMARY KEY (watchlist_id, symbol)
  )`,
  `CREATE TABLE IF NOT EXISTS quant_rankings (
    symbol TEXT PRIMARY KEY,
    score DOUBLE PRECISION NOT NULL,
    classification TEXT NOT NULL,
    sector TEXT,
    sector_rank INTEGER,
    valuation_score DOUBLE PRECISION,
    profitability_score DOUBLE PRECISION,
    dividend_score DOUBLE PRECISION,
    debt_score DOUBLE PRECISION,
    growth_score DOUBLE PRECISION,
    deterioration_flags TEXT DEFAULT '[]',
    positives TEXT DEFAULT '[]',
    risks TEXT DEFAULT '[]',
    explanation TEXT DEFAULT '',
    criteria_json TEXT DEFAULT '{}',
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS bot_recommendations (
    id SERIAL PRIMARY KEY,
    run_date TEXT NOT NULL,
    symbol TEXT NOT NULL,
    asset_type TEXT DEFAULT 'stock',
    score DOUBLE PRECISION,
    price_at_rec DOUBLE PRECISION,
    classification TEXT,
    positives TEXT DEFAULT '[]',
    risks TEXT DEFAULT '[]',
    summary TEXT DEFAULT '',
    delivered_telegram INTEGER DEFAULT 0,
    current_price DOUBLE PRECISION,
    return_pct DOUBLE PRECISION,
    evaluated_at TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS idx_assets_type_sector ON assets(asset_type, sector)',
  'CREATE INDEX IF NOT EXISTS idx_bot_recs_date_score ON bot_recommendations(run_date DESC, score DESC)',
  'CREATE INDEX IF NOT EXISTS idx_dividends_symbol_date ON dividends(symbol, pay_date DESC)',
  'CREATE INDEX IF NOT EXISTS idx_quant_rankings_score ON quant_rankings(score DESC)',
];

function createPostgresDb(connectionString) {
  const { Pool } = require('pg');
  const isLocal = /localhost|127\.0\.0\.1/i.test(connectionString) || /sslmode=disable/i.test(connectionString);

  const pool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: process.env.VERCEL ? 3 : 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  });

  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        const client = await pool.connect();
        try {
          for (const stmt of PG_SCHEMA_STATEMENTS) {
            await client.query(stmt);
          }
          await client.query(
            `INSERT INTO watchlists (id, name, created_at)
             VALUES (1, 'Minha Lista Principal', $1)
             ON CONFLICT (id) DO NOTHING`,
            [new Date().toISOString()]
          );
          await client.query(
            `SELECT setval(
               pg_get_serial_sequence('watchlists', 'id'),
               GREATEST((SELECT COALESCE(MAX(id), 1) FROM watchlists), 1)
             )`
          );
        } catch (err) {
          schemaPromise = null;
          throw err;
        } finally {
          client.release();
        }
      })();
    }
    return schemaPromise;
  }

  const adapter = {
    dialect: 'postgres',

    async allAsync(sql, params = []) {
      await ensureSchema();
      const res = await pool.query(convertPlaceholders(sql), params);
      return res.rows || [];
    },

    async getAsync(sql, params = []) {
      await ensureSchema();
      const res = await pool.query(convertPlaceholders(sql), params);
      return res.rows?.[0] || null;
    },

    async runAsync(sql, params = []) {
      await ensureSchema();
      let pgSql = convertPlaceholders(sql).trim();
      const needsReturningId =
        /^INSERT\s+INTO\s+(watchlists|investments|bot_recommendations)\b/i.test(pgSql) &&
        !/\bRETURNING\b/i.test(pgSql);
      if (needsReturningId) {
        pgSql = `${pgSql.replace(/;$/, '')} RETURNING id`;
      }
      const res = await pool.query(pgSql, params);
      return {
        lastID: res.rows?.[0]?.id ?? null,
        changes: res.rowCount ?? 0,
      };
    },

    async upsertPriceHistory(symbol, points) {
      if (!points || points.length === 0) return;
      await ensureSchema();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const p of points) {
          await client.query(
            `INSERT INTO price_history (symbol, date, open, high, low, close, volume, source)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (symbol, date) DO UPDATE SET
               open = EXCLUDED.open,
               high = EXCLUDED.high,
               low = EXCLUDED.low,
               close = EXCLUDED.close,
               volume = EXCLUDED.volume,
               source = EXCLUDED.source`,
            [symbol, p.date, p.open ?? null, p.high ?? null, p.low ?? null, p.close, p.volume ?? 0, 'brapi-live']
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    async upsertDividends(symbol, rows) {
      if (!rows || rows.length === 0) return;
      await ensureSchema();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const d of rows) {
          await client.query(
            `INSERT INTO dividends (symbol, pay_date, amount, type, source)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (symbol, pay_date, type) DO UPDATE SET
               amount = EXCLUDED.amount,
               source = EXCLUDED.source`,
            [symbol, d.pay_date, d.amount, d.type, d.source || 'brapi-live']
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    async checkHealth() {
      await ensureSchema();
      const res = await pool.query('SELECT 1 AS ok');
      return Boolean(res.rows?.[0] && Number(res.rows[0].ok) === 1);
    },

    async closeGracefully() {
      await pool.end().catch(() => {});
    },
  };

  if (process.env.NODE_ENV !== 'test') {
    console.log('PostgreSQL (Supabase) database pool configured');
  }
  return adapter;
}

function createSqliteDb() {
  const sqlite3 = require('sqlite3').verbose();

  const dbPath = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve(__dirname, '../../data.db');

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Failed to open SQLite database:', err.message);
    } else {
      if (process.env.NODE_ENV !== 'test') {
        console.log('SQLite database connected at', dbPath);
      }
      db.serialize(() => {
        db.run('PRAGMA journal_mode = WAL;');
        db.run('PRAGMA busy_timeout = 5000;');
        db.run('PRAGMA foreign_keys = ON;');

        db.run(`CREATE TABLE IF NOT EXISTS investments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          avg_price REAL NOT NULL,
          current_price REAL
        );`);

        db.run(`CREATE TABLE IF NOT EXISTS stock_notes (
          symbol TEXT PRIMARY KEY,
          thesis TEXT DEFAULT '',
          risks TEXT DEFAULT '',
          target_price REAL,
          checklist TEXT DEFAULT '[]',
          updated_at TEXT
        );`);

        db.run(`CREATE TABLE IF NOT EXISTS assets (
          symbol TEXT PRIMARY KEY,
          name TEXT,
          asset_type TEXT DEFAULT 'stock',
          sector TEXT,
          subsector TEXT,
          cnpj TEXT,
          logo TEXT,
          price REAL,
          change_pct REAL,
          volume REAL,
          market_cap REAL,
          source TEXT,
          updated_at TEXT
        );`);

        db.run(`CREATE TABLE IF NOT EXISTS fundamentals (
          symbol TEXT PRIMARY KEY,
          pl REAL,
          pvp REAL,
          ev_ebitda REAL,
          dy REAL,
          roe REAL,
          roa REAL,
          roic REAL,
          margem_liquida REAL,
          margem_ebitda REAL,
          divida_liquida REAL,
          divida_liquida_ebitda REAL,
          divida_liquida_pl REAL,
          crescimento_receita REAL,
          crescimento_lucro REAL,
          receita_liquida REAL,
          lucro_liquido REAL,
          patrimonio_liquido REAL,
          source TEXT,
          reference_date TEXT,
          updated_at TEXT
        );`);

        db.run(`CREATE TABLE IF NOT EXISTS price_history (
          symbol TEXT NOT NULL,
          date TEXT NOT NULL,
          open REAL,
          high REAL,
          low REAL,
          close REAL NOT NULL,
          volume REAL,
          source TEXT,
          PRIMARY KEY (symbol, date)
        );`);

        db.run(`CREATE TABLE IF NOT EXISTS dividends (
          symbol TEXT NOT NULL,
          pay_date TEXT NOT NULL,
          amount REAL NOT NULL,
          type TEXT DEFAULT 'DIVIDENDO',
          source TEXT,
          PRIMARY KEY (symbol, pay_date, type)
        );`);

        db.run(`CREATE TABLE IF NOT EXISTS macro_indicators (
          key TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          value REAL NOT NULL,
          unit TEXT,
          ref_date TEXT,
          source TEXT,
          updated_at TEXT
        );`);

        db.run(`CREATE TABLE IF NOT EXISTS watchlists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          created_at TEXT
        );`);

        db.run(`CREATE TABLE IF NOT EXISTS watchlist_items (
          watchlist_id INTEGER NOT NULL,
          symbol TEXT NOT NULL,
          added_at TEXT,
          PRIMARY KEY (watchlist_id, symbol),
          FOREIGN KEY (watchlist_id) REFERENCES watchlists(id) ON DELETE CASCADE
        );`);

        db.run(`CREATE TABLE IF NOT EXISTS quant_rankings (
          symbol TEXT PRIMARY KEY,
          score REAL NOT NULL,
          classification TEXT NOT NULL,
          sector TEXT,
          sector_rank INTEGER,
          valuation_score REAL,
          profitability_score REAL,
          dividend_score REAL,
          debt_score REAL,
          growth_score REAL,
          deterioration_flags TEXT DEFAULT '[]',
          positives TEXT DEFAULT '[]',
          risks TEXT DEFAULT '[]',
          explanation TEXT DEFAULT '',
          criteria_json TEXT DEFAULT '{}',
          updated_at TEXT
        );`);

        db.run(`CREATE TABLE IF NOT EXISTS bot_recommendations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_date TEXT NOT NULL,
          symbol TEXT NOT NULL,
          asset_type TEXT DEFAULT 'stock',
          score REAL,
          price_at_rec REAL,
          classification TEXT,
          positives TEXT DEFAULT '[]',
          risks TEXT DEFAULT '[]',
          summary TEXT DEFAULT '',
          delivered_telegram INTEGER DEFAULT 0,
          current_price REAL,
          return_pct REAL,
          evaluated_at TEXT
        );`);

        db.run('CREATE INDEX IF NOT EXISTS idx_assets_type_sector ON assets(asset_type, sector);');
        db.run('CREATE INDEX IF NOT EXISTS idx_bot_recs_date_score ON bot_recommendations(run_date DESC, score DESC);');
        db.run('CREATE INDEX IF NOT EXISTS idx_dividends_symbol_date ON dividends(symbol, pay_date DESC);');
        db.run('CREATE INDEX IF NOT EXISTS idx_quant_rankings_score ON quant_rankings(score DESC);');

        db.run(
          `INSERT OR IGNORE INTO watchlists (id, name, created_at) VALUES (1, 'Minha Lista Principal', ?)`,
          [new Date().toISOString()]
        );
      });
    }
  });

  db.dialect = 'sqlite';

  db.allAsync = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });

  db.getAsync = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
    });

  db.runAsync = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });

  db.upsertPriceHistory = (symbol, points) =>
    new Promise((resolve, reject) => {
      if (!points || points.length === 0) return resolve();
      db.serialize(() => {
        db.run('BEGIN IMMEDIATE', (beginErr) => {
          if (beginErr) return reject(beginErr);
          const stmt = db.prepare(
            `INSERT INTO price_history (symbol, date, open, high, low, close, volume, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (symbol, date) DO UPDATE SET
               open = excluded.open,
               high = excluded.high,
               low = excluded.low,
               close = excluded.close,
               volume = excluded.volume,
               source = excluded.source`
          );
          for (const p of points) {
            stmt.run(
              symbol,
              p.date,
              p.open ?? null,
              p.high ?? null,
              p.low ?? null,
              p.close,
              p.volume ?? 0,
              'brapi-live'
            );
          }
          stmt.finalize((finErr) => {
            if (finErr) {
              db.run('ROLLBACK', () => reject(finErr));
              return;
            }
            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                db.run('ROLLBACK', () => reject(commitErr));
                return;
              }
              resolve();
            });
          });
        });
      });
    });

  db.upsertDividends = (symbol, rows) =>
    new Promise((resolve, reject) => {
      if (!rows || rows.length === 0) return resolve();
      db.serialize(() => {
        db.run('BEGIN IMMEDIATE', (beginErr) => {
          if (beginErr) return reject(beginErr);
          const stmt = db.prepare(
            `INSERT INTO dividends (symbol, pay_date, amount, type, source)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (symbol, pay_date, type) DO UPDATE SET
               amount = excluded.amount,
               source = excluded.source`
          );
          for (const d of rows) {
            stmt.run(symbol, d.pay_date, d.amount, d.type, d.source || 'brapi-live');
          }
          stmt.finalize((finErr) => {
            if (finErr) {
              db.run('ROLLBACK', () => reject(finErr));
              return;
            }
            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                db.run('ROLLBACK', () => reject(commitErr));
                return;
              }
              resolve();
            });
          });
        });
      });
    });

  db.checkHealth = () =>
    new Promise((resolve, reject) => {
      db.get('SELECT 1 AS ok', [], (err, row) => {
        if (err) return reject(err);
        resolve(Boolean(row && row.ok === 1));
      });
    });

  db.closeGracefully = () =>
    new Promise((resolve) => {
      db.close((err) => {
        if (err && process.env.NODE_ENV !== 'test') {
          console.error('Error closing SQLite database:', err.message);
        }
        resolve();
      });
    });

  return db;
}

const connectionUrl = (process.env.DATABASE_URL || '').trim();
const dbInstance = isPostgresUrl(connectionUrl) ? createPostgresDb(connectionUrl) : createSqliteDb();
dbInstance.convertPlaceholders = convertPlaceholders;

module.exports = dbInstance;
