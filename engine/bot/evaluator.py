"""Evaluates historical bot recommendations against current live prices."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone


def evaluate_recommendations(conn: sqlite3.Connection) -> dict[str, float | int | None]:
    """Update return_pct and current_price for all historical recommendations."""
    now = datetime.now(timezone.utc).isoformat()
    rows = conn.execute(
        """
        SELECT b.id, b.symbol, b.price_at_rec, a.price AS live_price
        FROM bot_recommendations b
        LEFT JOIN assets a ON a.symbol = b.symbol
        """
    ).fetchall()

    evaluated = 0
    returns: list[float] = []

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

    conn.commit()

    avg_return = round(sum(returns) / len(returns), 2) if returns else None
    hit_rate = round((sum(1 for x in returns if x > 0) / len(returns)) * 100.0, 1) if returns else None
    return {
        "evaluated": evaluated,
        "avg_return_pct": avg_return,
        "hit_rate_pct": hit_rate,
    }

