"""Unit tests for the Python Quantitative Engine, Deterioration Detector, and Daily Bot."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from engine.db import get_connection
from engine.analyzer import evaluate_company, run_quantitative_analysis
from engine.collectors.cvm_fii_collector import _isin_to_fii_ticker
from engine.collectors.cvm_collector import CNPJ_TO_TICKER
from engine.collectors.market_collector import _request_headers
from engine.bot.daily_bot import format_telegram_report, run_daily_bot
from engine.bot.evaluator import evaluate_recommendations


class EngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "test.db"
        self.conn = get_connection(self.db_path)

    def tearDown(self) -> None:
        self.conn.close()
        self.tmp.cleanup()

    def test_evaluate_company_strong_vs_deteriorating(self) -> None:
        strong = evaluate_company(
            {
                "symbol": "TEST4",
                "sector": "Energia",
                "pl": 6.5,
                "pvp": 1.1,
                "dy": 9.2,
                "roe": 22.0,
                "roic": 16.5,
                "margem_liquida": 21.0,
                "divida_liquida_ebitda": 0.9,
                "crescimento_receita": 14.0,
                "crescimento_lucro": 18.0,
            },
            {"pl": 10.0, "roe": 15.0, "dy": 6.0},
            selic=13.75,
        )
        self.assertGreaterEqual(strong["score"], 80.0)
        self.assertEqual(strong["classification"], "Oportunidade Forte")
        self.assertEqual(strong["deterioration_flags"], [])

        weak = evaluate_company(
            {
                "symbol": "RISC3",
                "sector": "Varejo",
                "pl": -12.0,
                "pvp": 0.8,
                "dy": 0.0,
                "roe": -8.5,
                "margem_liquida": -4.2,
                "divida_liquida_ebitda": 4.8,
                "crescimento_receita": -15.0,
                "crescimento_lucro": -30.0,
            },
            {"pl": 14.0, "roe": 12.0, "dy": 3.0},
            selic=13.75,
        )
        self.assertLess(weak["score"], 40.0)
        self.assertGreaterEqual(len(weak["deterioration_flags"]), 3)

    def test_pipeline_scoring_bot_and_performance_evaluation(self) -> None:
        self.conn.execute(
            "INSERT INTO macro_indicators VALUES ('selic', 'Meta Selic', 13.75, '% a.a.', '01/11/2026', 'BCB', '2026-11-17')"
        )
        self.conn.execute(
            "INSERT INTO assets (symbol, name, asset_type, sector, price) VALUES ('PETR4', 'Petrobras', 'stock', 'Energia', 40.0)"
        )
        self.conn.execute(
            """INSERT INTO fundamentals (symbol, pl, pvp, dy, roe, margem_liquida, divida_liquida_ebitda, crescimento_receita, crescimento_lucro)
               VALUES ('PETR4', 4.5, 1.1, 12.0, 25.0, 23.0, 0.9, 15.0, 20.0)"""
        )
        self.conn.commit()

        ranked = run_quantitative_analysis(self.conn)
        self.assertEqual(len(ranked), 1)
        self.assertEqual(ranked[0]["sector_rank"], 1)

        bot_res = run_daily_bot(self.conn, top_n=3, send_telegram=False, run_date_str="2026-11-10")
        self.assertEqual(bot_res["count"], 1)
        self.assertIn("PETR4", bot_res["report"])
        self.assertIn("Aviso:", bot_res["report"])

        # Simulate price rising from 40.0 -> 44.0 (+10%) and re-evaluate
        self.conn.execute("UPDATE assets SET price = 44.0 WHERE symbol = 'PETR4'")
        self.conn.commit()

        perf = evaluate_recommendations(self.conn)
        self.assertEqual(perf["evaluated"], 1)
        self.assertEqual(perf["avg_return_pct"], 10.0)
        self.assertEqual(perf["hit_rate_pct"], 100.0)

    def test_format_telegram_report_contains_disclaimer_and_escapes_html(self) -> None:
        txt = format_telegram_report(
            "2026-11-17",
            [
                {
                    "symbol": "BBAS3",
                    "sector": "Bancos & Seguros <BR>_test",
                    "score": 88.0,
                    "price": 28.5,
                    "positives": ["P/L < 6x & ROE > 18%"],
                    "risks": ["Risco estatal_macro"],
                }
            ],
            [{"symbol": "RISC3", "score": 25.0, "deterioration_flags": ["ROE < 0%"]}],
            [{"name": "Meta Selic", "value": 13.75, "unit": "%"}],
            ai_summary="Resumo com <tag> & destaque em BBAS3.",
        )
        self.assertIn("<b>BBAS3</b>", txt)
        self.assertIn("Bancos &amp; Seguros &lt;BR&gt;_test", txt)
        self.assertIn("P/L &lt; 6x &amp; ROE &gt; 18%", txt)
        self.assertIn("ROE &lt; 0%", txt)
        self.assertIn("Resumo com &lt;tag&gt; &amp; destaque em BBAS3.", txt)
        self.assertIn("Meta Selic", txt)
        self.assertIn("Nao representa recomendacao", txt)

    def test_cvm_cnpj_map_preserves_distinct_tickers(self) -> None:
        self.assertEqual(CNPJ_TO_TICKER.get("02846056000197"), "CCRO3")
        self.assertEqual(CNPJ_TO_TICKER.get("02387241000160"), "RAIL3")
        self.assertEqual(CNPJ_TO_TICKER.get("02558157000162"), "VIVT3")

    def test_cvm_isin_to_fii_ticker(self) -> None:
        self.assertEqual(_isin_to_fii_ticker("BRMXRFCTF008"), "MXRF11")
        self.assertEqual(_isin_to_fii_ticker("BRHGLGCTF004"), "HGLG11")
        self.assertIsNone(_isin_to_fii_ticker("BRPETRACNPR6"))
        self.assertIsNone(_isin_to_fii_ticker(""))

    def test_brapi_token_is_sent_only_in_authorization_header(self) -> None:
        previous = os.environ.get("BRAPI_TOKEN")
        try:
            os.environ["BRAPI_TOKEN"] = "test-token"
            headers = _request_headers()
            self.assertEqual(headers["Authorization"], "Bearer test-token")
            self.assertNotIn("token", headers)
        finally:
            if previous is None:
                os.environ.pop("BRAPI_TOKEN", None)
            else:
                os.environ["BRAPI_TOKEN"] = previous

    def test_run_daily_safe_step_isolates_collector_failures(self):
        from engine.run_daily import safe_step

        warnings = []
        ok_val = safe_step("BCB", lambda: [1, 2, 3], [], warnings)
        self.assertEqual(ok_val, [1, 2, 3])
        self.assertEqual(warnings, [])

        def boom():
            raise RuntimeError("CVM timeout")

        fallback = safe_step("CVM FIIs", boom, 0, warnings)
        self.assertEqual(fallback, 0)
        self.assertEqual(len(warnings), 1)
        self.assertIn("CVM FIIs", warnings[0])

    def test_convert_placeholders_to_pg_preserves_quoted_literals(self):
        from engine.db import convert_placeholders_to_pg, resolve_postgres_url, sanitize_pg_url

        sql = "SELECT * FROM assets WHERE symbol = ? AND name != 'why?' AND sector LIKE ?"
        self.assertEqual(
            convert_placeholders_to_pg(sql),
            "SELECT * FROM assets WHERE symbol = %s AND name != 'why?' AND sector LIKE %s",
        )
        vercel_url = "postgres://u:p@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x"
        self.assertEqual(resolve_postgres_url({"POSTGRES_URL": vercel_url}), vercel_url)
        clean = sanitize_pg_url(vercel_url)
        self.assertNotIn("supa=", clean)
        self.assertIn("sslmode=require", clean)


if __name__ == "__main__":
    unittest.main()

