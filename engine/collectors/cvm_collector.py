"""Official CVM Open Data (DFP Annual + ITR Quarterly) collector — free, public ODbL license.

Downloads official DRE (Demonstração do Resultado) and BPP (Patrimônio Líquido) CSV files
from https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ to compute real revenue growth,
net income growth, net margin, and ROE for 40+ major B3 companies.
"""

from __future__ import annotations

import csv
import io
import sqlite3
import urllib.request
import zipfile
from datetime import datetime, timezone

# Official CNPJ (digits only) -> Main B3 ticker mapping (42 major B3 companies)
CNPJ_TO_TICKER: dict[str, str] = {
    "33000167000101": "PETR4",
    "33592510000154": "VALE3",
    "60872504000123": "ITUB4",
    "00000000000191": "BBAS3",
    "60746948000112": "BBDC4",
    "07526557000100": "ABEV3",
    "84429695000111": "WEGE3",
    "16670085000155": "RENT3",
    "16404287000155": "SUZB3",
    "02916265000160": "JBSS3",
    "47960950000121": "MGLU3",
    "92754738000162": "LREN3",
    "17344597000194": "BBSE3",
    "50746577000115": "CSAN3",
    "10629105000168": "PRIO3",
    "00001180000126": "ELET3",
    "30306294000145": "BPAC11",
    "61585865000151": "RADL3",
    "02558157000162": "VIVT3",
    "53113791000122": "TOTS3",
    "90400888000142": "SANB11",
    "09346601000125": "B3SA3",
    "02429144000193": "CPFE3",
    "76483817000120": "CPLE6",
    "17155730000164": "CMIG4",
    "02474103000119": "EGIE3",
    "07859971000130": "TAEE11",
    "03220438000173": "EQTL3",
    "43776517000180": "SBSP3",
    "33611500000119": "GGBR4",
    "33042730000104": "CSNA3",
    "60894730000105": "USIM5",
    "89637490000145": "KLBN11",
    "07689002000189": "EMBR3",
    "02846056000197": "CCRO3",
    "02387241000160": "RAIL3",
    "02421421000111": "TIMS3",
    "01838723000127": "BRFS3",
    "33256439000139": "UGPA3",
    "08343492000120": "VBBR3",
    "06057223000171": "ASAI3",
    "04128563000110": "ENGI11",
    "09611768000176": "RDOR3",
}


def _clean_cnpj(raw: str) -> str:
    return "".join(ch for ch in (raw or "") if ch.isdigit())


def _parse_scale(scale: str) -> float:
    return 1000.0 if (scale or "").strip().upper() == "MIL" else 1.0


def _download_cvm_zip(doc_type: str, year: int) -> tuple[bytes | None, int]:
    """Download DFP or ITR zip, falling back to previous year if current year isn't published yet."""
    doc_upper = doc_type.upper()
    doc_lower = doc_type.lower()
    for y in (year, year - 1):
        url = f"https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/{doc_upper}/DADOS/{doc_lower}_cia_aberta_{y}.zip"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "InvestAnalytics/1.0"})
            with urllib.request.urlopen(req, timeout=35) as resp:
                return resp.read(), y
        except Exception as exc:
            print(f"[CVM {doc_upper}] Ano {y} indisponivel ({type(exc).__name__})")
    return None, year


def _parse_and_persist_cvm(conn: sqlite3.Connection, raw_zip: bytes, doc_type: str, target_year: int) -> int:
    doc_lower = doc_type.lower()
    doc_upper = doc_type.upper()

    dre_data: dict[str, dict[str, dict[str, float]]] = {}
    dre_latest_dt: dict[tuple[str, str], str] = {}
    latest_ref_date: dict[str, str] = {}
    equity_data: dict[str, float] = {}
    equity_latest_dt: dict[str, str] = {}

    with zipfile.ZipFile(io.BytesIO(raw_zip)) as zf:
        dre_name = f"{doc_lower}_cia_aberta_DRE_con_{target_year}.csv"
        if dre_name in zf.namelist():
            with zf.open(dre_name) as fp:
                reader = csv.DictReader(io.TextIOWrapper(fp, encoding="latin-1"), delimiter=";")
                for row in reader:
                    cnpj = _clean_cnpj(row.get("CNPJ_CIA", ""))
                    ticker = CNPJ_TO_TICKER.get(cnpj)
                    if not ticker:
                        continue
                    cd = (row.get("CD_CONTA") or "").strip()
                    if cd not in ("3.01", "3.11"):
                        continue
                    ordem = (row.get("ORDEM_EXERC") or "").strip().upper()
                    if ordem not in ("ÚLTIMO", "PENÚLTIMO"):
                        continue
                    dt_fim = (row.get("DT_FIM_EXERC") or "").strip()
                    # Keep the most recent reference date for each (ticker, ordem)
                    prev_ordem_dt = dre_latest_dt.get((ticker, ordem), "")
                    if dt_fim < prev_ordem_dt:
                        continue
                    if dt_fim > prev_ordem_dt:
                        dre_latest_dt[(ticker, ordem)] = dt_fim
                        dre_data.setdefault(ticker, {})[ordem] = {}
                    if ordem == "ÚLTIMO" and dt_fim > latest_ref_date.get(ticker, ""):
                        latest_ref_date[ticker] = dt_fim
                    try:
                        val = float(row.get("VL_CONTA") or 0) * _parse_scale(row.get("ESCALA_MOEDA", ""))
                    except ValueError:
                        continue
                    dre_data.setdefault(ticker, {}).setdefault(ordem, {})[cd] = val

        bpp_name = f"{doc_lower}_cia_aberta_BPP_con_{target_year}.csv"
        if bpp_name in zf.namelist():
            with zf.open(bpp_name) as fp:
                reader = csv.DictReader(io.TextIOWrapper(fp, encoding="latin-1"), delimiter=";")
                for row in reader:
                    cnpj = _clean_cnpj(row.get("CNPJ_CIA", ""))
                    ticker = CNPJ_TO_TICKER.get(cnpj)
                    if not ticker:
                        continue
                    if (row.get("CD_CONTA") or "").strip() != "2.03":
                        continue
                    if (row.get("ORDEM_EXERC") or "").strip().upper() != "ÚLTIMO":
                        continue
                    dt_fim = (row.get("DT_FIM_EXERC") or "").strip()
                    if dt_fim < equity_latest_dt.get(ticker, ""):
                        continue
                    try:
                        val = float(row.get("VL_CONTA") or 0) * _parse_scale(row.get("ESCALA_MOEDA", ""))
                    except ValueError:
                        continue
                    equity_latest_dt[ticker] = dt_fim
                    equity_data[ticker] = val

    now = datetime.now(timezone.utc).isoformat()
    updated = 0
    for ticker, by_ordem in dre_data.items():
        curr = by_ordem.get("ÚLTIMO", {})
        prev = by_ordem.get("PENÚLTIMO", {})

        rev_curr = curr.get("3.01")
        rev_prev = prev.get("3.01")
        ni_curr = curr.get("3.11")
        ni_prev = prev.get("3.11")
        eq = equity_data.get(ticker)

        rev_growth = round(((rev_curr - rev_prev) / abs(rev_prev)) * 100, 2) if (rev_curr is not None and rev_prev) else None
        ni_growth = round(((ni_curr - ni_prev) / abs(ni_prev)) * 100, 2) if (ni_curr is not None and ni_prev and ni_prev > 0) else None
        net_margin = round((ni_curr / rev_curr) * 100, 2) if (ni_curr is not None and rev_curr) else None
        # Only compute annual ROE from DFP (ITR is partial-year net income)
        roe = (
            round((ni_curr / eq) * 100, 2)
            if (doc_upper == "DFP" and ni_curr is not None and eq and eq > 0)
            else None
        )

        ref_date = latest_ref_date.get(ticker) or f"{target_year}-12-31"

        conn.execute(
            """
            INSERT INTO fundamentals (
                symbol, roe, margem_liquida, crescimento_receita, crescimento_lucro,
                receita_liquida, lucro_liquido, patrimonio_liquido, source, reference_date, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(symbol) DO UPDATE SET
                roe = COALESCE(excluded.roe, fundamentals.roe),
                margem_liquida = COALESCE(excluded.margem_liquida, fundamentals.margem_liquida),
                crescimento_receita = COALESCE(excluded.crescimento_receita, fundamentals.crescimento_receita),
                crescimento_lucro = COALESCE(excluded.crescimento_lucro, fundamentals.crescimento_lucro),
                receita_liquida = COALESCE(excluded.receita_liquida, fundamentals.receita_liquida),
                lucro_liquido = COALESCE(excluded.lucro_liquido, fundamentals.lucro_liquido),
                patrimonio_liquido = COALESCE(excluded.patrimonio_liquido, fundamentals.patrimonio_liquido),
                source = excluded.source,
                reference_date = excluded.reference_date,
                updated_at = excluded.updated_at
            """,
            (
                ticker,
                roe,
                net_margin,
                rev_growth,
                ni_growth,
                rev_curr,
                ni_curr,
                eq,
                f"CVM {doc_upper} {target_year}",
                ref_date,
                now,
            ),
        )
        updated += 1

    conn.commit()
    return updated


def sync_cvm_dfp(conn: sqlite3.Connection, year: int | None = None) -> int:
    """Download and persist official annual DFP statements."""
    raw_zip, y = _download_cvm_zip("DFP", year or (datetime.now().year - 1))
    if not raw_zip:
        return 0
    return _parse_and_persist_cvm(conn, raw_zip, "DFP", y)


def sync_cvm_itr(conn: sqlite3.Connection, year: int | None = None) -> int:
    """Download and persist official quarterly ITR statements."""
    raw_zip, y = _download_cvm_zip("ITR", year or datetime.now().year)
    if not raw_zip:
        return 0
    return _parse_and_persist_cvm(conn, raw_zip, "ITR", y)
