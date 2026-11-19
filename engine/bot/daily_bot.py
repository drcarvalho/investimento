"""Daily Suggestions Bot — generates transparent quantitative report, saves history, and sends to Telegram."""

from __future__ import annotations

import html
import json
import os
import sqlite3
import urllib.request
from datetime import date, datetime, timezone
from typing import Any


DISCLAIMER = (
    "Aviso: Relatorio estritamente informativo baseado em dados publicos e criterios "
    "quantitativos transparentes. Nao representa recomendacao de compra/venda nem garantia de rentabilidade."
)


def _esc(value: Any) -> str:
    return html.escape(str(value), quote=False)


def format_telegram_report(
    run_date: str,
    top_picks: list[dict[str, Any]],
    alerts: list[dict[str, Any]],
    macro: list[dict[str, Any]],
    ai_summary: str | None = None,
) -> str:
    lines = [f"📊 <b>Investimento Flash — Relatório Diário ({_esc(run_date)})</b>", ""]

    if macro:
        macro_parts = [f"{_esc(m['name'])}: {_esc(m['value'])}{_esc(m['unit'])}" for m in macro]
        lines.append("🏦 <b>Cenário Macro (BCB):</b> " + " | ".join(macro_parts))
        lines.append("")

    if ai_summary and ai_summary.strip():
        lines.append("🤖 <b>Resumo Executivo:</b>")
        lines.append(_esc(ai_summary.strip()))
        lines.append("")

    lines.append("🏆 <b>Principais Destaques Quantitativos:</b>")
    for idx, pick in enumerate(top_picks, start=1):
        price_txt = f"R$ {pick['price']:.2f}" if pick.get("price") else "—"
        lines.append(
            f"{idx}. <b>{_esc(pick['symbol'])}</b> ({_esc(pick['sector'])}) — Score <b>{_esc(pick['score'])}/100</b> | {price_txt}"
        )
        if pick.get("positives"):
            lines.append("   ✅ " + "; ".join(_esc(p) for p in pick["positives"][:2]))
        if pick.get("risks"):
            lines.append("   ⚠️ " + "; ".join(_esc(r) for r in pick["risks"][:2]))

    if alerts:
        lines.append("")
        lines.append("🚨 <b>Alertas de Deterioração / Risco:</b>")
        for a in alerts[:3]:
            flags = "; ".join(_esc(f) for f in a.get("deterioration_flags", [])[:2])
            lines.append(f"• <b>{_esc(a['symbol'])}</b> (Score {_esc(a['score'])}): {flags}")

    lines.append("")
    lines.append(f"<i>{_esc(DISCLAIMER)}</i>")
    return "\n".join(lines)


TELEGRAM_MAX_LEN = 4096


def _truncate_telegram_html(text: str, limit: int = TELEGRAM_MAX_LEN) -> str:
    if len(text) <= limit:
        return text
    footer = f"\n\n<i>{_esc(DISCLAIMER)}</i>"
    cutoff = max(0, limit - len(footer) - 20)
    trimmed = text[:cutoff].rsplit("\n", 1)[0]
    return f"{trimmed}\n[...]{footer}"


def send_telegram_message(text: str) -> bool:
    """Send report via Telegram Bot API if TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID are configured."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps(
        {
            "chat_id": chat_id,
            "text": _truncate_telegram_html(text),
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 300
    except Exception as exc:
        print(f"[Telegram] Falha ao enviar mensagem ({type(exc).__name__}).")
        return False


def run_daily_bot(
    conn: sqlite3.Connection,
    top_n: int = 5,
    send_telegram: bool = False,
    run_date_str: str | None = None,
    ai_summary: str | None = None,
) -> dict[str, Any]:
    """Select top quantitative opportunities, persist daily recommendation history, and optionally notify Telegram."""
    today = run_date_str or date.today().isoformat()

    rows = conn.execute(
        """
        SELECT q.*, a.price, a.asset_type
        FROM quant_rankings q
        LEFT JOIN assets a ON a.symbol = q.symbol
        ORDER BY q.score DESC
        """
    ).fetchall()

    all_items = []
    for r in rows:
        all_items.append(
            {
                "symbol": r["symbol"],
                "asset_type": r["asset_type"] or "stock",
                "sector": r["sector"] or "Outros",
                "score": r["score"],
                "price": r["price"],
                "classification": r["classification"],
                "positives": json.loads(r["positives"] or "[]"),
                "risks": json.loads(r["risks"] or "[]"),
                "deterioration_flags": json.loads(r["deterioration_flags"] or "[]"),
                "explanation": r["explanation"] or "",
            }
        )

    # Prefer stocks without severe deterioration flags for top highlights
    top_picks = [x for x in all_items if not x["deterioration_flags"]][:top_n]
    alerts = [x for x in all_items if x["deterioration_flags"]]
    macro_rows = [dict(r) for r in conn.execute("SELECT name, value, unit FROM macro_indicators").fetchall()]

    report_text = format_telegram_report(today, top_picks, alerts, macro_rows, ai_summary=ai_summary)
    delivered = send_telegram_message(report_text) if send_telegram else False

    # Avoid duplicating entries for the same run_date + symbol
    conn.execute("DELETE FROM bot_recommendations WHERE run_date = ?", (today,))
    now = datetime.now(timezone.utc).isoformat()
    for pick in top_picks:
        conn.execute(
            """
            INSERT INTO bot_recommendations (
                run_date, symbol, asset_type, score, price_at_rec, classification,
                positives, risks, summary, delivered_telegram, current_price, return_pct, evaluated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                today,
                pick["symbol"],
                pick["asset_type"],
                pick["score"],
                pick["price"],
                pick["classification"],
                json.dumps(pick["positives"], ensure_ascii=False),
                json.dumps(pick["risks"], ensure_ascii=False),
                pick["explanation"],
                1 if delivered else 0,
                pick["price"],
                0.0 if pick["price"] else None,
                now,
            ),
        )
    conn.commit()

    return {
        "run_date": today,
        "count": len(top_picks),
        "alerts_count": len(alerts),
        "delivered_telegram": delivered,
        "report": report_text,
    }

