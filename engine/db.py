"""Shared database connection for the Financial Intelligence Engine.

Supports both:
- PostgreSQL / Supabase when DATABASE_URL starts with postgres:// or postgresql:// (requires psycopg[binary])
- Local SQLite (backend/data.db) using Python stdlib when DATABASE_URL is unset
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any, Sequence
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = ROOT_DIR / "backend" / "data.db"


def load_env(env_path: Path | None = None) -> None:
    """Lightweight .env loader without external dependencies."""
    target = env_path or (ROOT_DIR / "backend" / ".env")
    if not target.exists():
        return
    for raw_line in target.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def is_postgres_url(url: str | None) -> bool:
    return bool(url and url.strip().lower().startswith(("postgres://", "postgresql://")))


def resolve_postgres_url(env: dict[str, str] | None = None) -> str:
    """Support DATABASE_URL as well as Vercel Storage auto-injected POSTGRES_URL vars."""
    source = env if env is not None else os.environ
    for key in ("DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING"):
        val = (source.get(key) or "").strip()
        if is_postgres_url(val):
            return val
    return ""


def sanitize_pg_url(raw_url: str) -> str:
    """Strip non-libpq query parameters (e.g. supa=base-pooler.x, pgbouncer=true) from Vercel/Supabase URLs."""
    parts = urlsplit(raw_url.strip())
    is_local = (parts.hostname or "").lower() in ("localhost", "127.0.0.1")
    params = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if k.lower() not in ("supa", "pgbouncer")
    ]
    if not is_local and not any(k.lower() == "sslmode" for k, _ in params):
        params.append(("sslmode", "require"))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(params), parts.fragment))


def convert_placeholders_to_pg(sql: str) -> str:
    """Convert SQLite `?` placeholders to psycopg `%s` outside single-quoted literals."""
    out: list[str] = []
    in_quote = False
    i = 0
    n = len(sql)
    while i < n:
        ch = sql[i]
        if ch == "'":
            if in_quote and i + 1 < n and sql[i + 1] == "'":
                out.append("''")
                i += 2
                continue
            in_quote = not in_quote
            out.append(ch)
        elif ch == "%" and not in_quote:
            out.append("%%")
        elif ch == "?" and not in_quote:
            out.append("%s")
        else:
            out.append(ch)
        i += 1
    return "".join(out)


class PgConnectionAdapter:
    """Thin sqlite3-compatible wrapper over psycopg v3 so collectors/analyzer work unchanged on Supabase."""

    def __init__(self, raw_conn: Any) -> None:
        self._conn = raw_conn

    def execute(self, sql: str, params: Sequence[Any] | None = None) -> Any:
        pg_sql = convert_placeholders_to_pg(sql)
        cur = self._conn.cursor()
        if params is not None:
            cur.execute(pg_sql, tuple(params))
        else:
            cur.execute(pg_sql)
        return cur

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        self._conn.close()


PG_SCHEMA_STATEMENTS = [
    """CREATE TABLE IF NOT EXISTS assets (
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
    )""",
    """CREATE TABLE IF NOT EXISTS fundamentals (
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
    )""",
    """CREATE TABLE IF NOT EXISTS price_history (
        symbol TEXT NOT NULL,
        date TEXT NOT NULL,
        open DOUBLE PRECISION,
        high DOUBLE PRECISION,
        low DOUBLE PRECISION,
        close DOUBLE PRECISION NOT NULL,
        volume DOUBLE PRECISION,
        source TEXT,
        PRIMARY KEY (symbol, date)
    )""",
    """CREATE TABLE IF NOT EXISTS dividends (
        symbol TEXT NOT NULL,
        pay_date TEXT NOT NULL,
        amount DOUBLE PRECISION NOT NULL,
        type TEXT DEFAULT 'DIVIDENDO',
        source TEXT,
        PRIMARY KEY (symbol, pay_date, type)
    )""",
    """CREATE TABLE IF NOT EXISTS macro_indicators (
        key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        value DOUBLE PRECISION NOT NULL,
        unit TEXT,
        ref_date TEXT,
        source TEXT,
        updated_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS quant_rankings (
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
    )""",
    """CREATE TABLE IF NOT EXISTS bot_recommendations (
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
    )""",
    "CREATE INDEX IF NOT EXISTS idx_assets_type_sector ON assets(asset_type, sector)",
    "CREATE INDEX IF NOT EXISTS idx_bot_recs_date_score ON bot_recommendations(run_date DESC, score DESC)",
    "CREATE INDEX IF NOT EXISTS idx_dividends_symbol_date ON dividends(symbol, pay_date DESC)",
    """CREATE TABLE IF NOT EXISTS corporate_events (
        symbol TEXT NOT NULL,
        event_date TEXT NOT NULL,
        category TEXT NOT NULL,
        subject TEXT NOT NULL,
        link TEXT,
        source TEXT DEFAULT 'CVM IPE',
        updated_at TEXT,
        PRIMARY KEY (symbol, event_date, category, subject)
    )""",
    "CREATE INDEX IF NOT EXISTS idx_quant_rankings_score ON quant_rankings(score DESC)",
    "CREATE INDEX IF NOT EXISTS idx_corporate_events_symbol_date ON corporate_events(symbol, event_date DESC)",
]


def get_db_path() -> Path:
    env_db = os.environ.get("DB_PATH")
    return Path(env_db).resolve() if env_db else DEFAULT_DB_PATH


def get_connection(db_path: Path | None = None) -> Any:
    database_url = resolve_postgres_url()
    if db_path is None and database_url:
        import psycopg
        from psycopg.rows import dict_row

        conn_url = sanitize_pg_url(database_url)
        raw_conn = psycopg.connect(conn_url, row_factory=dict_row, prepare_threshold=None)
        adapter = PgConnectionAdapter(raw_conn)
        ensure_pg_schema(adapter)
        return adapter

    path = db_path or get_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    conn.execute("PRAGMA foreign_keys = ON;")
    ensure_schema(conn)
    return conn


def ensure_pg_schema(conn: PgConnectionAdapter) -> None:
    for stmt in PG_SCHEMA_STATEMENTS:
        conn.execute(stmt)
    conn.commit()


def ensure_schema(conn: sqlite3.Connection) -> None:
    """Guarantee all required tables exist (100% compatible with Node backend)."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS assets (
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
        );

        CREATE TABLE IF NOT EXISTS fundamentals (
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
        );

        CREATE TABLE IF NOT EXISTS price_history (
            symbol TEXT NOT NULL,
            date TEXT NOT NULL,
            open REAL,
            high REAL,
            low REAL,
            close REAL NOT NULL,
            volume REAL,
            source TEXT,
            PRIMARY KEY (symbol, date)
        );

        CREATE TABLE IF NOT EXISTS dividends (
            symbol TEXT NOT NULL,
            pay_date TEXT NOT NULL,
            amount REAL NOT NULL,
            type TEXT DEFAULT 'DIVIDENDO',
            source TEXT,
            PRIMARY KEY (symbol, pay_date, type)
        );

        CREATE TABLE IF NOT EXISTS macro_indicators (
            key TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            value REAL NOT NULL,
            unit TEXT,
            ref_date TEXT,
            source TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS quant_rankings (
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
        );

        CREATE TABLE IF NOT EXISTS bot_recommendations (
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
        );

        CREATE INDEX IF NOT EXISTS idx_assets_type_sector ON assets(asset_type, sector);
        CREATE INDEX IF NOT EXISTS idx_bot_recs_date_score ON bot_recommendations(run_date DESC, score DESC);
        CREATE INDEX IF NOT EXISTS idx_dividends_symbol_date ON dividends(symbol, pay_date DESC);
        CREATE TABLE IF NOT EXISTS corporate_events (
            symbol TEXT NOT NULL,
            event_date TEXT NOT NULL,
            category TEXT NOT NULL,
            subject TEXT NOT NULL,
            link TEXT,
            source TEXT DEFAULT 'CVM IPE',
            updated_at TEXT,
            PRIMARY KEY (symbol, event_date, category, subject)
        );

        CREATE INDEX IF NOT EXISTS idx_quant_rankings_score ON quant_rankings(score DESC);
        CREATE INDEX IF NOT EXISTS idx_corporate_events_symbol_date ON corporate_events(symbol, event_date DESC);
        """
    )
    conn.commit()
