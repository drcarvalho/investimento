"""Transparent Quantitative Financial Intelligence Engine (Python).

Evaluates B3 companies across 5 transparent pillars:
1. Valuation (25 pts): P/L, P/VP, EV/EBITDA + comparison vs. sector median
2. Profitability (25 pts): ROE, ROIC, Margem Líquida
3. Dividends (20 pts): Dividend Yield (relative to Selic / 6% Bazin hurdle)
4. Financial Health / Debt (15 pts): Dívida Líquida / EBITDA
5. Growth (15 pts): Crescimento de Receita e Lucro

Also detects fundamental deterioration flags and generates deterministic,
data-grounded explanations (NEVER invents numbers).
"""

from __future__ import annotations

import json
import sqlite3
import statistics
from datetime import datetime, timezone
from typing import Any

WEIGHTS = {
    "valuation": 25.0,
    "profitability": 25.0,
    "dividend": 20.0,
    "debt": 15.0,
    "growth": 15.0,
}


FINANCIAL_SECTOR_KEYWORDS = (
    "financeir",
    "banco",
    "seguro",
    "previd",
    "intermedi",
)


def _is_financial_sector(sector: str | None) -> bool:
    s = (sector or "").strip().lower()
    return any(k in s for k in FINANCIAL_SECTOR_KEYWORDS)


def evaluate_fii(row: dict[str, Any], selic: float | None = None) -> dict[str, Any]:
    """Dedicated transparent quantitative evaluation for B3 FIIs (P/VP, DY vs Selic, liquidity)."""
    pvp = row.get("pvp")
    dy = row.get("dy")
    market_cap = row.get("market_cap")
    volume = row.get("volume")

    positives: list[str] = []
    risks: list[str] = []
    deterioration: list[str] = []

    if pvp is None and dy is None:
        return {
            "symbol": row["symbol"],
            "sector": row.get("sector") or "FII",
            "score": 0.0,
            "classification": "Dados Insuficientes",
            "deterioration_flags": [],
            "positives": [],
            "risks": ["Sem P/VP ou Dividend Yield oficiais da CVM"],
            "explanation": "Dados insuficientes para avaliação quantitativa do FII.",
        }

    # Valuation P/VP (max 40)
    pvp_score = 0.0
    if pvp is not None:
        if pvp <= 0:
            deterioration.append(f"P/VP inválido ({pvp:.2f}x)")
        elif pvp <= 0.92:
            pvp_score = 40.0
            positives.append(f"FII com desconto patrimonial relevante (P/VP {pvp:.2f}x)")
        elif pvp <= 1.03:
            pvp_score = 32.0
            positives.append(f"FII próximo ao valor patrimonial (P/VP {pvp:.2f}x)")
        elif pvp <= 1.15:
            pvp_score = 20.0
        else:
            pvp_score = 8.0
            risks.append(f"Ágio elevado sobre o patrimônio (P/VP {pvp:.2f}x)")

    # Dividend Yield (max 45)
    dy_score = 0.0
    if dy is not None:
        if dy >= 11.0:
            dy_score = 45.0
            positives.append(f"DY mensalizado robusto ({dy:.2f}% a.a.)")
        elif dy >= 8.5:
            dy_score = 36.0
            positives.append(f"DY consistente ({dy:.2f}% a.a.)")
        elif dy >= 6.0:
            dy_score = 22.0
        elif dy > 0:
            dy_score = 10.0
            risks.append(f"DY abaixo da média de FIIs ({dy:.2f}% a.a.)")
        else:
            deterioration.append("Sem distribuição recente de rendimentos")
        if selic is not None and dy >= selic * 0.85:
            positives.append(f"Rendimento isento competitivo frente à Selic ({selic:.2f}%)")

    # Scale & Liquidity (max 15)
    liq_score = 8.0
    if (market_cap is not None and market_cap >= 500_000_000) or (volume is not None and volume >= 1_000_000):
        liq_score = 15.0
        positives.append("Boa liquidez / porte patrimonial")
    elif volume is not None and volume < 100_000:
        liq_score = 4.0
        risks.append("Liquidez diária reduzida")

    total = round(min(100.0, pvp_score + dy_score + liq_score), 1)
    if total >= 76 and not deterioration:
        classification = "Oportunidade Forte"
    elif total >= 60 and not deterioration:
        classification = "Fundamentos Sólidos"
    elif total >= 42:
        classification = "Neutro / Acompanhar"
    else:
        classification = "Atenção / Risco Elevado"

    return {
        "symbol": row["symbol"],
        "sector": row.get("sector") or "FII",
        "score": total,
        "classification": classification,
        "deterioration_flags": deterioration,
        "positives": positives[:5],
        "risks": risks[:5],
        "explanation": f"Pontuação FII {total}/100 ({classification}).",
    }


def _safe_median(values: list[float]) -> float | None:
    clean = [v for v in values if v is not None]
    return round(statistics.median(clean), 2) if clean else None


def evaluate_company(row: dict[str, Any], sector_medians: dict[str, float | None], selic: float | None = None) -> dict[str, Any]:
    """Compute transparent multi-factor score, deterioration flags, positives, risks, and explanation."""
    pl = row.get("pl")
    pvp = row.get("pvp")
    dy = row.get("dy")
    roe = row.get("roe")
    roic = row.get("roic")
    ml = row.get("margem_liquida")
    dl = row.get("divida_liquida")
    dl_ebitda = row.get("divida_liquida_ebitda")
    rev_g = row.get("crescimento_receita")
    ni_g = row.get("crescimento_lucro")

    positives: list[str] = []
    risks: list[str] = []
    deterioration: list[str] = []

    core_metrics = [pl, pvp, dy, roe, roic, ml, dl_ebitda, rev_g, ni_g]
    if all(m is None for m in core_metrics):
        return {
            "symbol": row["symbol"],
            "sector": row.get("sector") or "Outros",
            "score": 0.0,
            "classification": "Dados Insuficientes",
            "valuation_score": 0.0,
            "profitability_score": 0.0,
            "dividend_score": 0.0,
            "debt_score": 0.0,
            "growth_score": 0.0,
            "deterioration_flags": [],
            "positives": [],
            "risks": ["Sem indicadores fundamentalistas suficientes para avaliação"],
            "explanation": "Dados fundamentalistas insuficientes para cálculo quantitativo.",
            "criteria": {
                "weights": WEIGHTS,
                "sectorMedians": sector_medians,
                "selicRef": selic,
            },
        }

    # 1. Valuation (max 25)
    val_score = 0.0
    if pl is not None:
        if pl < 0:
            deterioration.append(f"Prejuízo líquido (P/L negativo: {pl:.1f})")
            risks.append("Empresa operando no prejuízo")
        elif pl == 0:
            risks.append("P/L zerado ou indisponível")
        elif pl <= 8:
            val_score += 15.0
            positives.append(f"P/L muito descontado ({pl:.2f}x)")
        elif pl <= 14:
            val_score += 11.0
            positives.append(f"P/L atrativo ({pl:.2f}x)")
        elif pl <= 22:
            val_score += 6.0
        else:
            val_score += 2.0
            risks.append(f"Múltiplo P/L elevado ({pl:.2f}x)")

    if pvp is not None:
        if pvp <= 0:
            deterioration.append(f"Patrimônio líquido negativo ou zerado (P/VP {pvp:.2f}x)")
            risks.append("Passivo a descoberto / patrimônio líquido comprometido")
        elif pvp <= 1.2:
            val_score += 10.0
            positives.append(f"Negociando próximo ou abaixo do patrimônio (P/VP {pvp:.2f}x)")
        elif pvp <= 2.2:
            val_score += 6.0
        elif pvp <= 4.0:
            val_score += 4.0
        else:
            val_score += 2.0
            risks.append(f"P/VP esticado ({pvp:.2f}x)")
    elif pl is not None and pl > 0:
        val_score = min(25.0, val_score * 1.3)

    # Sector comparison note
    med_pl = sector_medians.get("pl")
    if pl is not None and pl > 0 and med_pl is not None and med_pl > 0:
        if pl < med_pl * 0.85:
            positives.append(f"P/L abaixo da mediana do setor ({med_pl:.1f}x)")
        elif pl > med_pl * 1.35:
            risks.append(f"P/L acima da mediana do setor ({med_pl:.1f}x)")

    # 2. Profitability (max 25)
    prof_score = 0.0
    if roe is not None:
        if roe >= 20:
            prof_score += 15.0
            positives.append(f"ROE excelente ({roe:.1f}%)")
        elif roe >= 15:
            prof_score += 12.0
            positives.append(f"ROE consistente ({roe:.1f}%)")
        elif roe >= 10:
            prof_score += 8.0
        elif roe > 0:
            prof_score += 3.0
            risks.append(f"ROE abaixo do custo de capital ({roe:.1f}%)")
        else:
            deterioration.append(f"ROE negativo ({roe:.1f}%)")
            risks.append("Rentabilidade negativa sobre o patrimônio")

    if ml is not None:
        if ml >= 18:
            prof_score += 10.0
            positives.append(f"Margem líquida forte ({ml:.1f}%)")
        elif ml >= 10:
            prof_score += 7.0
        elif ml > 0:
            prof_score += 3.0
        else:
            deterioration.append(f"Margem líquida negativa ({ml:.1f}%)")
            risks.append("Compressão severa de margens")

    if roic is not None and roic >= 15 and len(positives) < 5:
        positives.append(f"ROIC robusto ({roic:.1f}%)")

    # 3. Dividends (max 20)
    div_score = 0.0
    if dy is not None:
        if dy >= 8:
            div_score = 20.0
            positives.append(f"Forte geração de dividendos (DY {dy:.2f}%)")
        elif dy >= 6:
            div_score = 16.0
            positives.append(f"Dividend Yield acima do piso Bazin de 6% ({dy:.2f}%)")
        elif dy >= 3.5:
            div_score = 10.0
        elif dy > 0:
            div_score = 5.0
        else:
            risks.append("Sem pagamento relevante de dividendos no período")
        if selic is not None and dy >= selic * 0.7:
            positives.append(f"DY competitivo frente à Selic ({selic:.2f}%)")

    # 4. Financial Health / Debt (max 15)
    is_financial = _is_financial_sector(row.get("sector"))
    debt_score = 10.0  # neutral when N/A
    if is_financial:
        # Net Debt/EBITDA does not apply to banks/insurers; derive pillar from ROE & P/VP solvency proxy
        if roe is not None and roe >= 15 and (pvp is None or pvp > 0):
            debt_score = 14.0
            positives.append("Setor financeiro: rentabilidade sólida (Dív./EBITDA não aplicável)")
        elif roe is not None and roe >= 10:
            debt_score = 10.0
        elif roe is not None and roe <= 0:
            debt_score = 3.0
            risks.append("Setor financeiro com ROE pressionado")
    elif dl_ebitda is not None:
        is_net_cash = (dl is not None and dl < 0) or (
            dl is None and (ml is None or ml > 0) and (pl is None or pl > 0)
        )
        if dl_ebitda < 0:
            if is_net_cash:
                debt_score = 15.0
                positives.append("Caixa líquido positivo (mais caixa do que dívida)")
            else:
                debt_score = 1.0
                deterioration.append(f"EBITDA negativo com endividamento (Dív. Líq./EBITDA {dl_ebitda:.2f}x)")
                risks.append("Geração operacional negativa (EBITDA negativo)")
        elif dl_ebitda <= 1.5:
            debt_score = 14.0
            positives.append(f"Endividamento conservador (Dív. Líq./EBITDA {dl_ebitda:.2f}x)")
        elif dl_ebitda <= 2.5:
            debt_score = 10.0
        elif dl_ebitda <= 3.5:
            debt_score = 5.0
            risks.append(f"Alavancagem moderada/alta ({dl_ebitda:.2f}x EBITDA)")
        else:
            debt_score = 1.0
            deterioration.append(f"Alavancagem elevada (Dív. Líq./EBITDA {dl_ebitda:.2f}x)")
            risks.append(f"Dívida elevada ({dl_ebitda:.2f}x EBITDA)")

    # 5. Growth (max 15 — neutral 7.5 when growth series unavailable so missing data isn't fabricated)
    growth_score = 7.5
    if rev_g is not None or ni_g is not None:
        growth_score = 0.0
        if rev_g is not None:
            if rev_g >= 10:
                growth_score += 7.5
                positives.append(f"Receita em expansão (+{rev_g:.1f}%)")
            elif rev_g >= 0:
                growth_score += 5.0
            elif rev_g < -10:
                deterioration.append(f"Queda relevante de receita ({rev_g:.1f}%)")
                risks.append(f"Retração de receita ({rev_g:.1f}%)")
            else:
                growth_score += 2.0
        else:
            growth_score += 3.5

        if ni_g is not None:
            if ni_g >= 12:
                growth_score += 7.5
                positives.append(f"Lucro líquido crescendo (+{ni_g:.1f}%)")
            elif ni_g >= 0:
                growth_score += 5.0
            elif ni_g < -15:
                deterioration.append(f"Deterioração de lucro ({ni_g:.1f}%)")
                risks.append(f"Queda expressiva de lucro ({ni_g:.1f}%)")
            else:
                growth_score += 2.0
        else:
            growth_score += 3.5

    total_score = round(min(100.0, val_score + prof_score + div_score + debt_score + growth_score), 1)

    if total_score >= 76 and not deterioration:
        classification = "Oportunidade Forte"
    elif total_score >= 62 and len(deterioration) <= 1:
        classification = "Fundamentos Sólidos"
    elif total_score >= 45:
        classification = "Neutro / Acompanhar"
    else:
        classification = "Atenção / Risco Elevado"

    # Build concise, strictly data-grounded explanation
    parts = [f"Pontuação quantitativa {total_score}/100 ({classification})."]
    if positives:
        parts.append("Destaques: " + "; ".join(positives[:3]) + ".")
    if deterioration:
        parts.append("Alertas de deterioração: " + "; ".join(deterioration) + ".")
    elif risks:
        parts.append("Pontos de atenção: " + "; ".join(risks[:2]) + ".")

    return {
        "symbol": row["symbol"],
        "sector": row.get("sector") or "Outros",
        "score": total_score,
        "classification": classification,
        "valuation_score": round(val_score, 1),
        "profitability_score": round(prof_score, 1),
        "dividend_score": round(div_score, 1),
        "debt_score": round(debt_score, 1),
        "growth_score": round(growth_score, 1),
        "deterioration_flags": deterioration,
        "positives": positives[:5],
        "risks": risks[:5],
        "explanation": " ".join(parts),
        "criteria": {
            "weights": WEIGHTS,
            "sectorMedians": sector_medians,
            "selicRef": selic,
            "sectorModel": "financial" if is_financial else "standard",
        },
    }


def run_quantitative_analysis(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """Run quantitative evaluation on all stocks with fundamentals and persist to quant_rankings."""
    selic_row = conn.execute("SELECT value FROM macro_indicators WHERE key = 'selic'").fetchone()
    selic = float(selic_row["value"]) if selic_row else None

    rows = conn.execute(
        """
        SELECT f.*, a.name, a.sector, a.price, a.change_pct
        FROM fundamentals f
        LEFT JOIN assets a ON a.symbol = f.symbol
        WHERE COALESCE(a.asset_type, 'stock') = 'stock'
          AND COALESCE(f.source, '') NOT LIKE 'CVM FII%'
        """
    ).fetchall()
    records = [dict(r) for r in rows]
    if not records:
        return []

    # Compute sector medians
    by_sector: dict[str, list[dict[str, Any]]] = {}
    for rec in records:
        sec = rec.get("sector") or "Outros"
        by_sector.setdefault(sec, []).append(rec)

    sector_medians_map: dict[str, dict[str, float | None]] = {}
    for sec, items in by_sector.items():
        sector_medians_map[sec] = {
            "pl": _safe_median([x["pl"] for x in items if x.get("pl") is not None and x["pl"] > 0]),
            "roe": _safe_median([x["roe"] for x in items if x.get("roe") is not None]),
            "dy": _safe_median([x["dy"] for x in items if x.get("dy") is not None]),
        }

    evaluated = [
        evaluate_company(rec, sector_medians_map.get(rec.get("sector") or "Outros", {}), selic)
        for rec in records
    ]

    # Compute rank within each sector
    by_sec_eval: dict[str, list[dict[str, Any]]] = {}
    for ev in evaluated:
        by_sec_eval.setdefault(ev["sector"], []).append(ev)
    for sec_list in by_sec_eval.values():
        sec_list.sort(key=lambda x: x["score"], reverse=True)
        for idx, ev in enumerate(sec_list, start=1):
            ev["sector_rank"] = idx

    evaluated.sort(key=lambda x: x["score"], reverse=True)
    now = datetime.now(timezone.utc).isoformat()

    for ev in evaluated:
        conn.execute(
            """
            INSERT INTO quant_rankings (
                symbol, score, classification, sector, sector_rank,
                valuation_score, profitability_score, dividend_score, debt_score, growth_score,
                deterioration_flags, positives, risks, explanation, criteria_json, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(symbol) DO UPDATE SET
                score = excluded.score,
                classification = excluded.classification,
                sector = excluded.sector,
                sector_rank = excluded.sector_rank,
                valuation_score = excluded.valuation_score,
                profitability_score = excluded.profitability_score,
                dividend_score = excluded.dividend_score,
                debt_score = excluded.debt_score,
                growth_score = excluded.growth_score,
                deterioration_flags = excluded.deterioration_flags,
                positives = excluded.positives,
                risks = excluded.risks,
                explanation = excluded.explanation,
                criteria_json = excluded.criteria_json,
                updated_at = excluded.updated_at
            """,
            (
                ev["symbol"],
                ev["score"],
                ev["classification"],
                ev["sector"],
                ev.get("sector_rank", 1),
                ev["valuation_score"],
                ev["profitability_score"],
                ev["dividend_score"],
                ev["debt_score"],
                ev["growth_score"],
                json.dumps(ev["deterioration_flags"], ensure_ascii=False),
                json.dumps(ev["positives"], ensure_ascii=False),
                json.dumps(ev["risks"], ensure_ascii=False),
                ev["explanation"],
                json.dumps(ev["criteria"], ensure_ascii=False),
                now,
            ),
        )

    active_symbols = [ev["symbol"] for ev in evaluated]
    if active_symbols:
        placeholders = ",".join("?" for _ in active_symbols)
        conn.execute(f"DELETE FROM quant_rankings WHERE symbol NOT IN ({placeholders})", active_symbols)

    conn.commit()
    return evaluated



def run_fii_quantitative_analysis(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """Run transparent quantitative evaluation across all listed FIIs with CVM fundamentals."""
    selic_row = conn.execute("SELECT value FROM macro_indicators WHERE key = 'selic'").fetchone()
    selic = float(selic_row["value"]) if selic_row else None

    rows = conn.execute(
        """
        SELECT a.symbol, a.name, a.sector, a.price, a.change_pct, a.volume, a.market_cap,
               f.pvp, f.dy, f.patrimonio_liquido, f.source, f.reference_date
        FROM assets a
        LEFT JOIN fundamentals f ON f.symbol = a.symbol
        WHERE a.asset_type = 'fii'
          AND (f.pvp IS NOT NULL OR f.dy IS NOT NULL)
        """
    ).fetchall()

    evaluated = []
    for r in rows:
        rec = dict(r)
        ev = evaluate_fii(rec, selic=selic)
        ev["price"] = rec.get("price")
        ev["pvp"] = rec.get("pvp")
        ev["dy"] = rec.get("dy")
        evaluated.append(ev)

    evaluated.sort(key=lambda x: x["score"], reverse=True)
    return evaluated
