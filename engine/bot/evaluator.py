"""Evaluates historical bot recommendations against current live prices and Selic/CDI benchmark."""

from __future__ import annotations

import sqlite3
from datetime import date, datetime, timezone


def _pro_rata_selic_pct(run_date_str: str | None, annual_selic: float | None) -> float | None:
    if not run_date_str or annual_selic is None or annual_selic <= 0:
        return None
    try:
        start = date.fromisoformat(str(run_date_str)[:10])
    except ValueError:
        return None
    days = max(0, (date.today() - start).days)
    if days == 0:
        return 0.0
    factor = (1.0 + annual_selic / 100.0) ** (days / 365.0) - 1.0
    return round(factor * 100.0, 2)


def evaluate_recommendations(conn: sqlite3.Connection) -> dict[str, float | int | None]:
    """Update return_pct and current_price for all historical recommendations, plus Selic benchmark alpha."""
    now = datetime.now(timezone.utc).isoformat()
    selic_row = conn.execute("SELECT value FROM macro_indicators WHERE key = 'selic'").fetchone()
    annual_selic = float(selic_row["value"]) if selic_row else None

    rows = conn.execute(
        """
        SELECT b.id, b.symbol, b.run_date, b.price_at_rec, a.price AS live_price
        FROM bot_recommendations b
        LEFT JOIN assets a ON a.symbol = b.symbol
        """
    ).fetchall()

    evaluated = 0
    returns: list[float] = []
    bench_returns: list[float] = []

    for r in rows:
        price_at_rec = r["price_at_rec"]
        live_price = r["live_price"]
        if price_at_rec and price_at_rec > 0 and live_price and live_price > 0:
            ret_pct = round(((live_price - price_at_rec) / price_at_rec) * 100.0, 2)
            conn.execute(
                """
                UPDATE bot_recommendations
                SET current_price = ?, return_pct = ?, evaluated_at = ?
                WHERE id = ?
                """,
                (live_price, ret_pct, now, r["id"]),
            )
            evaluated += 1
            returns.append(ret_pct)
            b_ret = _pro_rata_selic_pct(r["run_date"], annual_selic)
            if b_ret is not None:
                bench_returns.append(b_ret)

    conn.commit()

    avg_return = round(sum(returns) / len(returns), 2) if returns else None
    hit_rate = round((sum(1 for x in returns if x > 0) / len(returns)) * 100.0, 1) if returns else None
    avg_bench = round(sum(bench_returns) / len(bench_returns), 2) if bench_returns else None
    alpha_pct = round(avg_return - avg_bench, 2) if (avg_return is not None and avg_bench is not None) else None

    return {
        "evaluated": evaluated,
        "avg_return_pct": avg_return,
        "hit_rate_pct": hit_rate,
        "benchmark_selic_pct": avg_bench,
        "alpha_vs_selic_pct": alpha_pct,
    }
