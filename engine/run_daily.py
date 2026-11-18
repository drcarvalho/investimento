#!/usr/bin/env python3
"""Daily orchestration pipeline for the Financial Intelligence Engine & Telegram Bot.

Usage:
    python3 engine/run_daily.py                      # BCB + brapi (stocks/FIIs/ETFs/dividends) + CVM FIIs + Quant + Bot
    python3 engine/run_daily.py --with-cvm           # Also download & parse official CVM DFP + ITR statements
    python3 engine/run_daily.py --send-telegram      # Send report to Telegram (needs TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID)
    python3 engine/run_daily.py --with-ai            # Optional grounded executive summary via gemini-2.5-flash (GEMINI_API_KEY)
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path
from typing import Any, Callable, TypeVar

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.db import get_connection, load_env
from engine.collectors.bcb_collector import sync_bcb_macro
from engine.collectors.market_collector import sync_brapi_assets
from engine.collectors.cvm_fii_collector import sync_cvm_fiis
from engine.collectors.cvm_collector import sync_cvm_dfp, sync_cvm_itr
from engine.analyzer import run_quantitative_analysis
from engine.bot.daily_bot import run_daily_bot
from engine.bot.evaluator import evaluate_recommendations
from engine.ai_explainer import generate_grounded_summary

T = TypeVar("T")


def safe_step(label: str, fn: Callable[[], T], default: T, warnings: list[str]) -> T:
    """Run a pipeline stage isolating network/upstream failures so local analysis never aborts."""
    try:
        return fn()
    except Exception as exc:  # pragma: no cover - defensive isolation for external APIs
        msg = f"{label}: {type(exc).__name__}: {exc}"
        warnings.append(msg)
        print(f"    [AVISO] Falha isolada em {msg}. Continuando com dados locais...")
        return default


def main() -> int:
    parser = argparse.ArgumentParser(description="InvestAnalytics — Motor Quantitativo & Bot Diario")
    parser.add_argument("--with-cvm", action="store_true", help="Baixar DFP anual + ITR trimestral oficial da CVM")
    parser.add_argument("--skip-cvm-fiis", action="store_true", help="Pular download do Informe Mensal de FIIs da CVM")
    parser.add_argument("--with-ai", action="store_true", help="Adicionar resumo executivo via Gemini 2.5 Flash (requer GEMINI_API_KEY)")
    parser.add_argument("--send-telegram", action="store_true", help="Enviar relatorio diario para o Telegram")
    parser.add_argument("--skip-network", action="store_true", help="Rodar apenas analise e bot sobre o banco local")
    parser.add_argument("--top", type=int, default=5, help="Numero de ativos destaque no relatorio")
    args = parser.parse_args()

    load_env()
    conn = get_connection()
    warnings: list[str] = []
    try:
        macro: list[dict[str, Any]] = []
        if not args.skip_network:
            print("1/6 Sincronizando macro (Banco Central SGS)...")
            macro = safe_step("BCB SGS", lambda: sync_bcb_macro(conn), [], warnings)
            print(f"    -> {len(macro)} indicadores macro atualizados.")

            print("2/6 Sincronizando Acoes, FIIs, ETFs e Dividendos (brapi.dev)...")
            counts = safe_step(
                "brapi.dev",
                lambda: sync_brapi_assets(conn),
                {"stocks": 0, "fiis": 0, "etfs": 0, "detailed": 0},
                warnings,
            )
            print(
                f"    -> Acoes: {counts['stocks']}, FIIs: {counts['fiis']}, "
                f"ETFs: {counts['etfs']}, Detalhadas+Dividendos: {counts['detailed']}"
            )

            if not args.skip_cvm_fiis:
                print("3/6 Sincronizando Informe Mensal de FIIs da CVM (DY & P/VP reais)...")
                fii_count = safe_step("CVM FIIs", lambda: sync_cvm_fiis(conn), 0, warnings)
                print(f"    -> {fii_count} FIIs enriquecidos com dados oficiais da CVM.")

            if args.with_cvm:
                print("3b/6 Baixando DFP anual + ITR trimestral da CVM...")
                dfp_count = safe_step("CVM DFP", lambda: sync_cvm_dfp(conn), 0, warnings)
                itr_count = safe_step("CVM ITR", lambda: sync_cvm_itr(conn), 0, warnings)
                print(f"    -> CVM DFP: {dfp_count} empresas | CVM ITR: {itr_count} empresas.")

        print("4/6 Executando motor quantitativo e comparacao setorial...")
        rankings = run_quantitative_analysis(conn)
        print(f"    -> {len(rankings)} empresas ranqueadas.")

        print("5/6 Avaliando desempenho de recomendacoes anteriores...")
        perf = evaluate_recommendations(conn)
        print(f"    -> Avaliadas: {perf['evaluated']} | Retorno medio: {perf['avg_return_pct']}%")

        ai_summary = None
        if args.with_ai:
            if not macro:
                macro = [
                    dict(r)
                    for r in conn.execute("SELECT name, value, unit FROM macro_indicators").fetchall()
                ]
            ai_summary = safe_step(
                "Gemini AI",
                lambda: generate_grounded_summary(
                    date.today().isoformat(),
                    rankings[: args.top],
                    [r for r in rankings if r.get("deterioration_flags")],
                    macro,
                ),
                None,
                warnings,
            )

        print("6/6 Gerando relatorio diario do Bot...")
        bot_result = run_daily_bot(
            conn,
            top_n=args.top,
            send_telegram=args.send_telegram,
            ai_summary=ai_summary,
        )

        print(
            f"    -> {bot_result['count']} destaques salvos | Alertas: {bot_result['alerts_count']} | "
            f"Telegram enviado: {bot_result['delivered_telegram']}"
        )
        if warnings:
            print(f"    -> Pipeline concluido com {len(warnings)} aviso(s) de coleta externa.")
        print("\n" + bot_result["report"])
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
