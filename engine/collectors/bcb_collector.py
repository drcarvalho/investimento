"""Official Banco Central do Brasil (SGS) open-data macro collector (free, ODbL)."""

from __future__ import annotations

import json
import urllib.request
from datetime import datetime, timezone
import sqlite3

BCB_SERIES = [
    ("selic", 432, "Meta Selic", "% a.a."),
    ("ipca_12m", 13522, "IPCA (12 meses)", "%"),
    ("ipca_mensal", 433, "IPCA (Mensal)", "%"),
    ("ptax_usd", 10813, "Dólar PTAX", "R$"),
]


def _fetch_json(url: str, timeout: int = 10) -> list[dict]:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "InvestAnalytics/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def sync_bcb_macro(conn: sqlite3.Connection) -> list[dict]:
    """Fetch latest official BCB SGS values and persist to macro_indicators."""
    now = datetime.now(timezone.utc).isoformat()
    synced: list[dict] = []

    for key, code, name, unit in BCB_SERIES:
        url = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/dados/ultimos/1?formato=json"
        try:
            rows = _fetch_json(url)
            if not rows:
                continue
            latest = rows[0]
            value = float(str(latest["valor"]).replace(",", "."))
            ref_date = str(latest["data"])
            conn.execute(
                """
                INSERT INTO macro_indicators (key, name, value, unit, ref_date, source, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    name = excluded.name,
                    value = excluded.value,
                    unit = excluded.unit,
                    ref_date = excluded.ref_date,
                    source = excluded.source,
                    updated_at = excluded.updated_at
                """,
                (key, name, value, unit, ref_date, "BCB SGS", now),
            )
            synced.append({"key": key, "name": name, "value": value, "unit": unit, "ref_date": ref_date})
        except Exception as exc:
            print(f"[BCB] Falha ao buscar serie {key} ({code}): {exc}")

    conn.commit()
    return synced

