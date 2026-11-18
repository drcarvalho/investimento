"""Optional Gemini 2.5 Flash executive explainer (grounded strictly in deterministic engine output).

Active ONLY when GEMINI_API_KEY is present in environment (.env).
If unset or unavailable, returns None cleanly so the deterministic explanation is used at zero cost.
"""

from __future__ import annotations

import json
import os
import urllib.request
from typing import Any

MODEL_NAME = "gemini-2.5-flash"


def generate_grounded_summary(
    run_date: str,
    top_picks: list[dict[str, Any]],
    alerts: list[dict[str, Any]],
    macro: list[dict[str, Any]],
) -> str | None:
    """Ask Gemini 2.5 Flash to write a concise Portuguese summary using ONLY provided numbers."""
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None

    payload_data = {
        "data": run_date,
        "macro": macro,
        "destaques": [
            {
                "symbol": p["symbol"],
                "sector": p["sector"],
                "score": p["score"],
                "price": p.get("price"),
                "positives": p.get("positives", [])[:3],
                "risks": p.get("risks", [])[:2],
            }
            for p in top_picks[:5]
        ],
        "alertas_deterioracao": [
            {"symbol": a["symbol"], "score": a["score"], "flags": a.get("deterioration_flags", [])[:2]}
            for a in alerts[:3]
        ],
    }

    prompt = (
        "Você é um assistente educacional de análise quantitativa da B3. "
        "Com base EXCLUSIVAMENTE no JSON abaixo, escreva um resumo executivo curto (máximo 5 linhas) em português. "
        "REGRAS ESTRITAS: nunca invente números, preços, dividendos ou fatos que não estejam no JSON; "
        "não dê recomendação personalizada de compra ou venda; mantenha tom objetivo e informativo.\n\n"
        f"JSON:\n{json.dumps(payload_data, ensure_ascii=False)}"
    )

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{MODEL_NAME}:generateContent"
    )
    body = json.dumps(
        {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 260},
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        return text or None
    except Exception as exc:
        print(f"[Gemini] Resumo opcional indisponivel ({type(exc).__name__}). Usando texto deterministico.")
        return None

