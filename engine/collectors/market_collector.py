"""Market quotes & fundamentals collector (brapi.dev free tier + static seed + optional yfinance)."""

from __future__ import annotations

import json
import os
import sqlite3
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
STATIC_INDICATORS_PATH = ROOT_DIR / "backend" / "src" / "data" / "indicators-static.json"
BRAPI_BASE = "https://brapi.dev/api"
FREE_DETAILED_TICKERS = ["PETR4", "VALE3", "ITUB4", "MGLU3"]


def _request_headers() -> dict[str, str]:
    token = os.environ.get("BRAPI_TOKEN", "").strip()
    headers = {"Accept": "application/json", "User-Agent": "InvestAnalytics/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _fetch_json(url: str, timeout: int = 12) -> dict:
    req = urllib.request.Request(
        url,
        headers=_request_headers(),
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def sync_brapi_assets(conn: sqlite3.Connection) -> dict[str, int]:
    """Sync live stocks, FIIs, and ETFs from brapi free list endpoints into SQLite."""
    now = datetime.now(timezone.utc).isoformat()
    counts = {"stocks": 0, "fiis": 0, "etfs": 0, "detailed": 0}

    # 1. Stocks list (free, no token)
    try:
        data = _fetch_json(f"{BRAPI_BASE}/quote/list?sortBy=market_cap_basic&sortOrder=desc&limit=150&type=stock")
        for s in data.get("stocks", []):
            sym = (s.get("stock") or "").upper()
            if not sym or (sym.endswith("F") and len(sym) >= 6):
                continue
            conn.execute(
                """
                INSERT INTO assets (symbol, name, asset_type, sector, subsector, logo, price, change_pct, volume, market_cap, source, updated_at)
                VALUES (?, ?, 'stock', ?, ?, ?, ?, ?, ?, ?, 'brapi-list', ?)
                ON CONFLICT(symbol) DO UPDATE SET
                    name = COALESCE(excluded.name, assets.name),
                    sector = COALESCE(excluded.sector, assets.sector),
                    subsector = COALESCE(excluded.subsector, assets.subsector),
                    logo = COALESCE(excluded.logo, assets.logo),
                    price = excluded.price,
                    change_pct = excluded.change_pct,
                    volume = excluded.volume,
                    market_cap = COALESCE(excluded.market_cap, assets.market_cap),
                    source = excluded.source,
                    updated_at = excluded.updated_at
                """,
                (
                    sym,
                    s.get("name") or sym,
                    s.get("sector"),
                    s.get("subsector"),
                    s.get("logo"),
                    s.get("close"),
                    s.get("change"),
                    s.get("volume"),
                    s.get("market_cap"),
                    now,
                ),
            )
            counts["stocks"] += 1
    except Exception as exc:
        print(f"[brapi] Erro ao listar acoes ({type(exc).__name__})")

    # 2. FIIs & ETFs list (free, no token)
    try:
        data = _fetch_json(f"{BRAPI_BASE}/quote/list?sortBy=volume&sortOrder=desc&limit=120&type=fund")
        for f in data.get("stocks", []):
            sym = (f.get("stock") or "").upper()
            if not sym:
                continue
            sub_type = (f.get("subType") or "").lower()
            name_up = (f.get("name") or "").upper()
            asset_type = "etf" if (sub_type == "etf" or "ETF" in name_up or "INDICE" in name_up or "ÍNDICE" in name_up) else "fii"
            conn.execute(
                """
                INSERT INTO assets (symbol, name, asset_type, sector, logo, price, change_pct, volume, market_cap, source, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'brapi-list', ?)
                ON CONFLICT(symbol) DO UPDATE SET
                    name = COALESCE(excluded.name, assets.name),
                    asset_type = excluded.asset_type,
                    logo = COALESCE(excluded.logo, assets.logo),
                    price = excluded.price,
                    change_pct = excluded.change_pct,
                    volume = excluded.volume,
                    market_cap = COALESCE(excluded.market_cap, assets.market_cap),
                    source = excluded.source,
                    updated_at = excluded.updated_at
                """,
                (
                    sym,
                    f.get("name") or sym,
                    asset_type,
                    f.get("sector") or ("Fundos Imobiliários" if asset_type == "fii" else "ETFs"),
                    f.get("logo"),
                    f.get("close"),
                    f.get("change"),
                    f.get("volume"),
                    f.get("market_cap"),
                    now,
                ),
            )
            counts["etfs" if asset_type == "etf" else "fiis"] += 1
    except Exception as exc:
        print(f"[brapi] Erro ao listar FIIs/ETFs ({type(exc).__name__})")

    # 3. Seed baseline fundamentals from static indicators only when DB has no fresher CVM/live row
    if STATIC_INDICATORS_PATH.exists():
        static_data = json.loads(STATIC_INDICATORS_PATH.read_text(encoding="utf-8"))
        for sym, item in static_data.items():
            val = item.get("valuation") or {}
            rent = item.get("rentabilidade") or {}
            endiv = item.get("endividamento") or {}
            conn.execute(
                """
                INSERT INTO assets (symbol, name, asset_type, sector, subsector, logo, price, change_pct, volume, market_cap, source, updated_at)
                VALUES (?, ?, 'stock', ?, ?, ?, ?, ?, ?, ?, 'static-seed', ?)
                ON CONFLICT(symbol) DO UPDATE SET
                    sector = COALESCE(excluded.sector, assets.sector),
                    subsector = COALESCE(excluded.subsector, assets.subsector)
                """,
                (
                    sym,
                    item.get("name"),
                    item.get("sector"),
                    item.get("subsector"),
                    f"https://icons.brapi.dev/icons/{sym}.svg",
                    item.get("price"),
                    item.get("change"),
                    item.get("volume"),
                    item.get("marketCap"),
                    now,
                ),
            )
            conn.execute(
                """
                INSERT INTO fundamentals (
                    symbol, pl, pvp, ev_ebitda, dy, roe, roa, roic,
                    margem_liquida, margem_ebitda, divida_liquida_ebitda, divida_liquida_pl,
                    source, reference_date, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'static-baseline', ?, ?)
                ON CONFLICT(symbol) DO NOTHING
                """,
                (
                    sym,
                    val.get("pl"),
                    val.get("pvp"),
                    val.get("evEbitda"),
                    val.get("dividendYield"),
                    rent.get("roe"),
                    rent.get("roa"),
                    rent.get("roic"),
                    rent.get("margemLiquida"),
                    rent.get("margemEbitda"),
                    endiv.get("dividaLiquidaEbitda"),
                    endiv.get("dividaLiquidaPl"),
                    now[:10],
                    now,
                ),
            )

    # 4. Live detailed fundamentals + real price history + REAL DIVIDENDS for free brapi tickers
    for sym in FREE_DETAILED_TICKERS:
        try:
            url = f"{BRAPI_BASE}/quote/{sym}?range=3mo&interval=1d&dividends=true&modules=summaryProfile,defaultKeyStatistics,financialData"
            res = _fetch_json(url)
            results = res.get("results") or []
            if not results:
                continue
            q = results[0]
            stats = q.get("defaultKeyStatistics") or {}
            fin = q.get("financialData") or {}
            prof = q.get("summaryProfile") or {}

            total_debt = fin.get("totalDebt")
            total_cash = fin.get("totalCash")
            ebitda = fin.get("ebitda")
            net_debt = (total_debt - total_cash) if (total_debt is not None and total_cash is not None) else None
            net_debt_ebitda = round(net_debt / ebitda, 2) if (net_debt is not None and ebitda) else None
            dy_raw = stats.get("dividendYield") if stats.get("dividendYield") is not None else stats.get("yield")

            conn.execute(
                """
                UPDATE assets SET
                    cnpj = COALESCE(?, cnpj),
                    sector = COALESCE(?, sector),
                    subsector = COALESCE(?, subsector),
                    price = COALESCE(?, price),
                    change_pct = COALESCE(?, change_pct),
                    market_cap = COALESCE(?, market_cap),
                    updated_at = ?
                WHERE symbol = ?
                """,
                (
                    prof.get("cnpj"),
                    prof.get("sector"),
                    prof.get("industry"),
                    q.get("regularMarketPrice"),
                    q.get("regularMarketChangePercent"),
                    q.get("marketCap"),
                    now,
                    sym,
                ),
            )

            conn.execute(
                """
                INSERT INTO fundamentals (
                    symbol, pl, pvp, ev_ebitda, dy, roe, roa,
                    margem_liquida, margem_ebitda, divida_liquida, divida_liquida_ebitda,
                    divida_liquida_pl, crescimento_receita, crescimento_lucro,
                    receita_liquida, source, reference_date, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'brapi-live', ?, ?)
                ON CONFLICT(symbol) DO UPDATE SET
                    pl = COALESCE(excluded.pl, fundamentals.pl),
                    pvp = COALESCE(excluded.pvp, fundamentals.pvp),
                    ev_ebitda = COALESCE(excluded.ev_ebitda, fundamentals.ev_ebitda),
                    dy = COALESCE(excluded.dy, fundamentals.dy),
                    roe = COALESCE(excluded.roe, fundamentals.roe),
                    roa = COALESCE(excluded.roa, fundamentals.roa),
                    margem_liquida = COALESCE(excluded.margem_liquida, fundamentals.margem_liquida),
                    margem_ebitda = COALESCE(excluded.margem_ebitda, fundamentals.margem_ebitda),
                    divida_liquida = COALESCE(excluded.divida_liquida, fundamentals.divida_liquida),
                    divida_liquida_ebitda = COALESCE(excluded.divida_liquida_ebitda, fundamentals.divida_liquida_ebitda),
                    divida_liquida_pl = COALESCE(excluded.divida_liquida_pl, fundamentals.divida_liquida_pl),
                    crescimento_receita = COALESCE(excluded.crescimento_receita, fundamentals.crescimento_receita),
                    crescimento_lucro = COALESCE(excluded.crescimento_lucro, fundamentals.crescimento_lucro),
                    receita_liquida = COALESCE(excluded.receita_liquida, fundamentals.receita_liquida),
                    source = excluded.source,
                    reference_date = excluded.reference_date,
                    updated_at = excluded.updated_at
                """,
                (
                    sym,
                    round(q["priceEarnings"], 2) if q.get("priceEarnings") else None,
                    round(stats["priceToBook"], 2) if stats.get("priceToBook") else None,
                    round(stats["enterpriseToEbitda"], 2) if stats.get("enterpriseToEbitda") else None,
                    round(dy_raw * 100, 2) if dy_raw is not None else None,
                    round(fin["returnOnEquity"] * 100, 2) if fin.get("returnOnEquity") is not None else None,
                    round(fin["returnOnAssets"] * 100, 2) if fin.get("returnOnAssets") is not None else None,
                    round(fin["profitMargins"] * 100, 2) if fin.get("profitMargins") is not None else None,
                    round(fin["ebitdaMargins"] * 100, 2) if fin.get("ebitdaMargins") is not None else None,
                    round(net_debt, 0) if net_debt is not None else None,
                    net_debt_ebitda,
                    round(fin["debtToEquity"], 2) if fin.get("debtToEquity") is not None else None,
                    round(fin["revenueGrowth"] * 100, 2) if fin.get("revenueGrowth") is not None else None,
                    round(fin["earningsGrowth"] * 100, 2) if fin.get("earningsGrowth") is not None else None,
                    fin.get("totalRevenue"),
                    now[:10],
                    now,
                ),
            )

            # Persist real historical daily candles
            for candle in q.get("historicalDataPrice") or []:
                close = candle.get("close")
                ts = candle.get("date")
                if close and ts:
                    dt = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
                    conn.execute(
                        """
                        INSERT INTO price_history (symbol, date, open, high, low, close, volume, source)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'brapi-live')
                        ON CONFLICT(symbol, date) DO UPDATE SET
                            open = excluded.open,
                            high = excluded.high,
                            low = excluded.low,
                            close = excluded.close,
                            volume = excluded.volume,
                            source = excluded.source
                        """,
                        (sym, dt, candle.get("open"), candle.get("high"), candle.get("low"), round(close, 2), candle.get("volume") or 0),
                    )
            # Persist real cash dividends & JCP
            div_data = q.get("dividendsData") or {}
            for div in div_data.get("cashDividends") or []:
                raw_date = div.get("paymentDate") or div.get("lastDatePrior") or div.get("exDate")
                rate = div.get("rate")
                label = (div.get("label") or "DIVIDENDO").strip().upper()
                if raw_date and isinstance(rate, (int, float)) and rate > 0:
                    pay_date = str(raw_date)[:10]
                    conn.execute(
                        """
                        INSERT INTO dividends (symbol, pay_date, amount, type, source)
                        VALUES (?, ?, ?, ?, 'brapi-live')
                        ON CONFLICT(symbol, pay_date, type) DO UPDATE SET
                            amount = excluded.amount,
                            source = excluded.source
                        """,
                        (sym, pay_date, round(float(rate), 6), label),
                    )
            counts["detailed"] += 1
        except Exception as exc:
            print(f"[brapi] Erro ao coletar detalhes de {sym} ({type(exc).__name__})")

    conn.commit()
    return counts

