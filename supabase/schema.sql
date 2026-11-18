-- InvestAnalytics — PostgreSQL / Supabase Schema
-- Execute este script no Supabase SQL Editor (opcional: o backend também cria automaticamente no primeiro acesso).

CREATE TABLE IF NOT EXISTS investments (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  avg_price DOUBLE PRECISION NOT NULL,
  current_price DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS stock_notes (
  symbol TEXT PRIMARY KEY,
  thesis TEXT DEFAULT '',
  risks TEXT DEFAULT '',
  target_price DOUBLE PRECISION,
  checklist TEXT DEFAULT '[]',
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS assets (
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
);

CREATE TABLE IF NOT EXISTS fundamentals (
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
);

CREATE TABLE IF NOT EXISTS price_history (
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  open DOUBLE PRECISION,
  high DOUBLE PRECISION,
  low DOUBLE PRECISION,
  close DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION,
  source TEXT,
  PRIMARY KEY (symbol, date)
);

CREATE TABLE IF NOT EXISTS dividends (
  symbol TEXT NOT NULL,
  pay_date TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  type TEXT DEFAULT 'DIVIDENDO',
  source TEXT,
  PRIMARY KEY (symbol, pay_date, type)
);

CREATE TABLE IF NOT EXISTS macro_indicators (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  unit TEXT,
  ref_date TEXT,
  source TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS watchlists (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS watchlist_items (
  watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  added_at TEXT,
  PRIMARY KEY (watchlist_id, symbol)
);

CREATE TABLE IF NOT EXISTS quant_rankings (
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
);

CREATE TABLE IF NOT EXISTS bot_recommendations (
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
);

CREATE INDEX IF NOT EXISTS idx_assets_type_sector ON assets(asset_type, sector);
CREATE INDEX IF NOT EXISTS idx_bot_recs_date_score ON bot_recommendations(run_date DESC, score DESC);
CREATE INDEX IF NOT EXISTS idx_dividends_symbol_date ON dividends(symbol, pay_date DESC);
CREATE INDEX IF NOT EXISTS idx_quant_rankings_score ON quant_rankings(score DESC);

INSERT INTO watchlists (id, name, created_at)
VALUES (1, 'Minha Lista Principal', NOW()::TEXT)
ON CONFLICT (id) DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('watchlists', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM watchlists), 1)
);

