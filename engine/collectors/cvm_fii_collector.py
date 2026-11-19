"""Official CVM Open Data collector for FIIs (Informe Mensal — ODbL, free, zero auth).

Downloads https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_{year}.zip (~1.4 MB),
maps ISIN codes (BR<TICKER4>CTF... -> <TICKER4>11) automatically, and persists real:
- Valor Patrimonial por Cota (VPA) & P/VP (computed against live price in `assets`)
- Annualized Dividend Yield (from official monthly Percentual_Dividend_Yield_Mes)
- Patrimônio Líquido & Segmento de Atuação
"""

from __future__ import annotations

import csv
import io
import sqlite3
import urllib.request
import zipfile
from datetime import datetime, timezone


def _to_float(raw: str | None) -> float | None:
    if raw is None:
        return None
    s = raw.strip().replace(",", ".")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _isin_to_fii_ticker(isin: str) -> str | None:
    code = (isin or "").strip().upper()
    if len(code) >= 9 and code.startswith("BR") and code[6:9] == "CTF":
        root = code[2:6]
        if root.isalnum():
            return f"{root}11"
    return None


def sync_cvm_fiis(conn: sqlite3.Connection, year: int | None = None) -> int:
    """Download official CVM FII monthly report zip and populate real FII fundamentals."""
    target_year = year or datetime.now().year
    raw_zip = None
    for y in (target_year, target_year - 1):
        url = f"https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_{y}.zip"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "InvestAnalytics/1.0"})
            with urllib.request.urlopen(req, timeout=25) as resp:
                raw_zip = resp.read()
            target_year = y
            break
        except Exception as exc:
            print(f"[CVM FII] Ano {y} indisponivel ({type(exc).__name__})")

    if not raw_zip:
        return 0

    # Map CNPJ -> {ticker, segmento, nome} from geral CSV
    cnpj_info: dict[str, dict[str, str]] = {}
    # Collect monthly entries per CNPJ from complemento CSV
    comp_by_cnpj: dict[str, list[dict]] = {}

    with zipfile.ZipFile(io.BytesIO(raw_zip)) as zf:
        geral_name = f"inf_mensal_fii_geral_{target_year}.csv"
        if geral_name in zf.namelist():
            with zf.open(geral_name) as fp:
                reader = csv.DictReader(io.TextIOWrapper(fp, encoding="latin-1"), delimiter=";")
                for row in reader:
                    ticker = _isin_to_fii_ticker(row.get("Codigo_ISIN", ""))
                    cnpj = (row.get("CNPJ_Fundo_Classe") or "").strip()
                    if not ticker or not cnpj:
                        continue
                    cnpj_info[cnpj] = {
                        "ticker": ticker,
                        "segmento": (row.get("Segmento_Atuacao") or "").strip() or "Fundos Imobiliários",
                        "nome": (row.get("Nome_Fundo_Classe") or "").strip(),
                    }

        comp_name = f"inf_mensal_fii_complemento_{target_year}.csv"
        if comp_name in zf.namelist():
            with zf.open(comp_name) as fp:
                reader = csv.DictReader(io.TextIOWrapper(fp, encoding="latin-1"), delimiter=";")
                for row in reader:
                    cnpj = (row.get("CNPJ_Fundo_Classe") or "").strip()
                    if cnpj not in cnpj_info:
                        continue
                    ref_date = (row.get("Data_Referencia") or "").strip()
                    try:
                        versao = int(str(row.get("Versao") or "0").strip())
                    except ValueError:
                        versao = 0
                    vp_cota = _to_float(row.get("Valor_Patrimonial_Cotas"))
                    dy_mes = _to_float(row.get("Percentual_Dividend_Yield_Mes"))
                    pl = _to_float(row.get("Patrimonio_Liquido"))
                    if ref_date:
                        comp_by_cnpj.setdefault(cnpj, []).append(
                            {
                                "ref_date": ref_date,
                                "versao": versao,
                                "vp_cota": vp_cota,
                                "dy_mes": dy_mes,
                                "pl": pl,
                            }
                        )

    # Load live prices already in `assets` to calculate real P/VP
    price_rows = conn.execute("SELECT symbol, price FROM assets WHERE asset_type = 'fii'").fetchall()
    price_map = {r["symbol"].upper(): r["price"] for r in price_rows if r["price"]}

    now = datetime.now(timezone.utc).isoformat()
    updated = 0

    for cnpj, info in cnpj_info.items():
        entries = comp_by_cnpj.get(cnpj)
        if not entries:
            continue
        # Deduplicate by ref_date keeping highest restatement version & sort chronologically
        by_date: dict[str, dict] = {}
        for e in entries:
            prev = by_date.get(e["ref_date"])
            if prev is None or e.get("versao", 0) >= prev.get("versao", 0):
                by_date[e["ref_date"]] = e
        ordered = [by_date[d] for d in sorted(by_date.keys())]
        latest = ordered[-1]

        ticker = info["ticker"]
        vp_cota = latest.get("vp_cota")
        pl = latest.get("pl")
        live_price = price_map.get(ticker)

        pvp = (
            round(live_price / vp_cota, 2)
            if (live_price and vp_cota and vp_cota > 0)
            else None
        )

        # Annualize average monthly DY over the trailing 12 months reported by CVM
        recent_12m = ordered[-12:]
        monthly_dys = [e["dy_mes"] for e in recent_12m if e["dy_mes"] is not None and 0 <= e["dy_mes"] <= 0.15]
        dy_annual = None
        if monthly_dys:
            avg_monthly = sum(monthly_dys) / len(monthly_dys)
            dy_annual = round(avg_monthly * 12.0 * 100.0, 2)

        # Only persist FIIs that are actively listed in our live B3 assets table
        if ticker not in price_map:
            continue

        conn.execute(
            """
            UPDATE assets SET
                sector = COALESCE(?, sector),
                cnpj = COALESCE(?, cnpj)
            WHERE symbol = ?
            """,
            (info["segmento"], cnpj, ticker),
        )

        conn.execute(
            """
            INSERT INTO fundamentals (
                symbol, pvp, dy, patrimonio_liquido, source, reference_date, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(symbol) DO UPDATE SET
                pvp = COALESCE(excluded.pvp, fundamentals.pvp),
                dy = COALESCE(excluded.dy, fundamentals.dy),
                patrimonio_liquido = COALESCE(excluded.patrimonio_liquido, fundamentals.patrimonio_liquido),
                source = excluded.source,
                reference_date = excluded.reference_date,
                updated_at = excluded.updated_at
            """,
            (
                ticker,
                pvp,
                dy_annual,
                pl,
                f"CVM FII {target_year}",
                latest["ref_date"],
                now,
            ),
        )
        updated += 1

    conn.commit()
    return updated
