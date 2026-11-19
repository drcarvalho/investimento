"""Official CVM Open Data IPE (Fatos Relevantes & Comunicados ao Mercado) collector.

Downloads https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_{year}.zip
(ODbL, free, zero auth) and persists the latest official disclosures for mapped B3 companies.
"""

from __future__ import annotations

import csv
import io
import sqlite3
import urllib.request
import zipfile
from datetime import datetime, timezone

from engine.collectors.cvm_collector import CNPJ_TO_TICKER, _clean_cnpj

RELEVANT_CATEGORIES = (
    "fato relevante",
    "comunicado ao mercado",
    "aviso aos acionistas",
    "assembleia",
)


def _is_relevant_category(raw_cat: str) -> bool:
    low = (raw_cat or "").strip().lower()
    return any(k in low for k in RELEVANT_CATEGORIES)


def _safe_cvm_link(raw_link: str) -> str | None:
    link = (raw_link or "").strip()
    if link.startswith(("https://", "http://")):
        return link[:500]
    return None


def _parse_and_persist_ipe(conn: sqlite3.Connection, raw_zip: bytes, target_year: int, max_per_ticker: int = 12) -> int:
    by_ticker: dict[str, list[dict[str, str | None]]] = {}

    with zipfile.ZipFile(io.BytesIO(raw_zip)) as zf:
        csv_name = f"ipe_cia_aberta_{target_year}.csv"
        if csv_name not in zf.namelist():
            candidates = [n for n in zf.namelist() if n.lower().endswith(".csv")]
            csv_name = candidates[0] if candidates else ""
        if not csv_name:
            return 0

        with zf.open(csv_name) as fp:
            reader = csv.DictReader(io.TextIOWrapper(fp, encoding="latin-1"), delimiter=";")
            for row in reader:
                cnpj = _clean_cnpj(row.get("CNPJ_Companhia", "") or row.get("CNPJ_CIA", ""))
                ticker = CNPJ_TO_TICKER.get(cnpj)
                if not ticker:
                    continue
                category = (row.get("Categoria") or "").strip()
                if not _is_relevant_category(category):
                    continue
                event_date = (row.get("Data_Entrega") or row.get("Data_Referencia") or "").strip()[:10]
                if not event_date:
                    continue
                subject = (row.get("Assunto") or row.get("Tipo") or category).strip()[:240]
                link = _safe_cvm_link(row.get("Link_Download") or "")
                by_ticker.setdefault(ticker, []).append(
                    {
                        "event_date": event_date,
                        "category": category[:80],
                        "subject": subject or category[:80],
                        "link": link,
                    }
                )

    now = datetime.now(timezone.utc).isoformat()
    inserted = 0
    for ticker, events in by_ticker.items():
        events.sort(key=lambda e: str(e["event_date"]), reverse=True)
        seen: set[tuple[str, str, str]] = set()
        kept = 0
        for ev in events:
            key = (str(ev["event_date"]), str(ev["category"]), str(ev["subject"]))
            if key in seen:
                continue
            seen.add(key)
            conn.execute(
                """
                INSERT INTO corporate_events (symbol, event_date, category, subject, link, source, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(symbol, event_date, category, subject) DO UPDATE SET
                    link = COALESCE(excluded.link, corporate_events.link),
                    updated_at = excluded.updated_at
                """,
                (
                    ticker,
                    ev["event_date"],
                    ev["category"],
                    ev["subject"],
                    ev["link"],
                    f"CVM IPE {target_year}",
                    now,
                ),
            )
            inserted += 1
            kept += 1
            if kept >= max_per_ticker:
                break

    conn.commit()
    return inserted


def sync_cvm_events(conn: sqlite3.Connection, year: int | None = None) -> int:
    """Download and persist official CVM IPE corporate events."""
    target_year = year or datetime.now().year
    for y in (target_year, target_year - 1):
        url = f"https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_{y}.zip"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "InvestAnalytics/1.0"})
            with urllib.request.urlopen(req, timeout=35) as resp:
                raw_zip = resp.read()
            return _parse_and_persist_ipe(conn, raw_zip, y)
        except Exception as exc:
            print(f"[CVM IPE] Ano {y} indisponivel ({type(exc).__name__})")
    return 0
