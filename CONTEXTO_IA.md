# CONTEXTO_IA — Portal de Inteligência Financeira (InvestAnalytics)

> **Como usar este documento em outra IA:** Anexe ou cole este arquivo no início da conversa e adicione ao final o que deseja construir, corrigir ou evoluir. Ele contém a arquitetura exata, regras de negócio, schema do banco, endpoints, decisões de segurança e padrões visuais já implementados.

---

## 0. Prompt Inicial Recomendado (copie e cole junto com este arquivo)

```text
Você vai atuar como Arquiteto de Software e Desenvolvedor Sênior no projeto InvestAnalytics descrito no documento CONTEXTO_IA.md abaixo.

REGRAS OBRIGATÓRIAS:
1. NÃO comece do zero — evolua o código existente preservando todas as rotas, tabelas SQLite e funcionalidades atuais.
2. Custo zero prioritário: não introduza serviços pagos sem minha autorização explícita.
3. NUNCA invente dados financeiros (cotações, histórico, dividendos ou indicadores). Se um dado não estiver disponível, retorne `null` na API e exiba `—` na interface com mensagem transparente.
4. Nunca exponha chaves/tokens no código-fonte ou na URL/logs; use apenas variáveis de ambiente (.env).
5. Mantenha os textos da interface em português claro e profissional (UX Writing sem jargão técnico como "SQLite", "engine/run_daily.py" ou "brapi-live").
6. Caso use IA generativa, prefira o modelo `gemini-2.5-flash` apenas para explicar resultados já calculados pelo motor determinístico.
7. Ao final de qualquer alteração, execute todos os testes (backend, frontend e engine Python) e o build do frontend.

Minha solicitação agora é: [DESCREVA AQUI SUA TAREFA]
```

---

## 1. Visão Geral do Projeto

O **InvestAnalytics** é uma plataforma web gratuita de inteligência financeira focada no mercado brasileiro (**B3**), composta por 3 camadas integradas por um banco **SQLite (modo WAL)**:

1. **Frontend (`frontend/`)**: SPA em **React 18 + React Router 7 + Vite 7**, com tema claro/escuro, design responsivo, busca rápida (`Ctrl+K` / `/`), gráficos SVG interativos sem dependências pesadas e acessibilidade WCAG AA.
2. **Backend (`backend/`)**: API REST em **Node.js 20 + Express 4 + sqlite3 v6**, usando `fetch` nativo (zero dependência de `axios`/`node-fetch`), cache em memória, segurança por headers/CORS/rate limiting e telemetria estruturada.
3. **Motor Quantitativo & Bot Diário (`engine/`)**: Pipeline em **Python 3.12 puro (apenas biblioteca padrão — zero `pip install`)** que coleta dados públicos (Banco Central, CVM, brapi.dev), calcula scores auditáveis de 0–100, detecta deterioração financeira, envia relatórios formatados ao Telegram e avalia historicamente o desempenho das sugestões.

---

## 2. Stack Tecnológica & Versões Atuais

| Camada | Tecnologias |
|---|---|
| **Frontend** | React `18.2`, React Router DOM `7.18+`, Vite `7.3+`, CSS Custom Properties (`theme.css`), Nginx Unprivileged `1.27-alpine` |
| **Backend** | Node.js `20`, Express `4.19+`, `cors`, `sqlite3` `6.0+` (SQLite WAL), Node native `fetch` & `node:test` |
| **Motor / Bot** | Python `3.12` (stdlib pura: `sqlite3`, `urllib.request`, `csv`, `zipfile`, `html`, `unittest`) |
| **Infra / CI** | Docker Compose (`backend` + `frontend` + `engine`), GitHub Actions (`.github/workflows/ci.yml`) |
| **IA Opcional** | Google Gemini API (`gemini-2.5-flash`) via header `x-goog-api-key` |

---

## 3. Estrutura de Pastas e Arquivos

```text
investimento/
├── README.md                              # Documentação geral de uso e arquitetura
├── CONTEXTO_IA.md                         # Este documento de contexto para IA
├── docker-compose.yml                     # Orquestração (backend:4000, frontend:3000->8080, engine)
├── .github/workflows/ci.yml               # CI: testes backend, frontend + build, Python engine (permissions: contents: read)
│
├── backend/
│   ├── Dockerfile                         # Node 20 Alpine, non-root (UID 1000 `node`), healthcheck
│   ├── .env.example                       # Modelo de variáveis opcionais (nunca commitar `.env`)
│   ├── package.json
│   ├── data.db                            # Banco SQLite compartilhado (modo WAL)
│   ├── src/
│   │   ├── index.js                       # Entrypoint HTTP + graceful shutdown
│   │   ├── app.js                         # Express app, trust proxy, rate limiters, /api/health, /api/metrics
│   │   ├── models/db.js                   # Conexão SQLite WAL, schema completo, índices e helpers async
│   │   ├── middleware/
│   │   │   ├── security.js                # Loader .env, headers de segurança, CORS allowlist, rate limiter
│   │   │   └── observability.js           # Logs JSON estruturados, X-Request-Id, métricas HTTP
│   │   ├── utils/validation.js            # normalizeTicker, sanitizeSearchQuery, validateNotePayload
│   │   ├── data/indicators-static.json    # Base fundamentalista de referência (20 empresas B3)
│   │   ├── services/
│   │   │   ├── brapi.js                   # Integração brapi.dev (cotações, FIIs, ETFs, histórico, cache)
│   │   │   ├── bcb.js                     # Banco Central SGS (Selic, IPCA 12m/mensal, Dólar PTAX)
│   │   │   └── bolsai.js                  # Integração opcional gratuita Bolsai
│   │   └── routes/
│   │       ├── market.js                  # Resumo de mercado e termômetro B3
│   │       ├── indicators.js              # Screening, detalhe do ativo, histórico real, Graham/Bazin, viabilidade
│   │       ├── rankings.js                # Rankings por DY, ROE, P/L, viabilidade
│   │       ├── search.js                  # Busca rápida de ativos
│   │       ├── assets.js                  # /api/macro, /api/assets (stock/fii/etf), /api/assets/:symbol/dividends
│   │       ├── intelligence.js            # /rankings, /recommendations, /sector-peers/:symbol, POST /run
│   │       ├── watchlists.js              # CRUD de múltiplas listas de acompanhamento
│   │       ├── notes.js                   # CRUD do Caderno de Tese (preço-alvo, riscos, checklist)
│   │       └── investments.js             # GET /api/investments (tabela legada preservada)
│   └── tests/
│       ├── api.test.js                    # 10 testes de integração (health, metrics, CORS, CRUD, índices, auth)
│       └── validation.test.js             # 3 testes unitários de validação
│
├── frontend/
│   ├── Dockerfile                         # Build Vite + nginxinc/nginx-unprivileged:1.27-alpine (porta 8080)
│   ├── nginx.conf                         # Proxy /api/, timeout 70s p/ /api/intelligence/run, CSP produção, SPA fallback
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx                        # Router, lazy loading, Navbar, skip-link WCAG, tema claro/escuro
│   │   ├── api.js                         # Wrapper fetch com timeout e tratamento de erros
│   │   ├── styles/theme.css               # Design system completo (tokens light/dark, hero, macro-grid, tabelas)
│   │   ├── utils/security.js              # safeHttpUrl, sanitizeTicker, escapeCsvCell (anti-CSV injection)
│   │   ├── hooks/
│   │   │   ├── useWatchlist.js            # Favoritos rápidos sincronizados
│   │   │   └── useRecentStocks.js         # Histórico recente de visualização
│   │   ├── components/
│   │   │   ├── CommandPalette.jsx         # Busca global (Ctrl+K ou `/`)
│   │   │   ├── MacroBar.jsx               # Grid executivo de 4 KPIs macroeconômicos (BCB)
│   │   │   ├── MarketHeatmap.jsx          # Mapa visual de altas/baixas B3
│   │   │   ├── PriceChart.jsx             # Gráfico interativo SVG de cotações reais
│   │   │   ├── RadarChart.jsx             # Gráfico radar fundamentalista comparativo
│   │   │   ├── DividendsPanel.jsx         # Gráfico anual + tabela de proventos reais
│   │   │   ├── StudyTools.jsx             # Simulador de dividendos/juros compostos + Caderno de Tese
│   │   │   ├── Rankings.jsx               # Blocos de ranking na Home
│   │   │   ├── IndicatorCard.jsx          # Card de indicador com tooltip educativo
│   │   │   ├── ViabilityBadge.jsx         # Selo visual de saúde fundamentalista
│   │   │   ├── StockLogo.jsx              # Logo com fallback tipográfico seguro
│   │   │   ├── Toast.jsx                  # Notificações acessíveis (role="status", aria-live="polite")
│   │   │   ├── ErrorBoundary.jsx
│   │   │   └── Icons.jsx                  # Biblioteca própria de ícones SVG
│   │   └── pages/
│   │       ├── Home.jsx                   # Dashboard do mercado brasileiro (`/`)
│   │       ├── Screener.jsx               # Screening avançado de ações + exportação CSV (`/acoes`)
│   │       ├── Assets.jsx                 # Explorador de FIIs e ETFs com P/VP e DY CVM (`/ativos`)
│   │       ├── StockDetail.jsx            # Análise completa do ativo com 5 abas (`/acoes/:symbol`)
│   │       ├── Compare.jsx                # Comparador de até 5 ativos + pares do setor (`/comparar`)
│   │       ├── Intelligence.jsx           # Ranking quantitativo, alertas e histórico do bot (`/inteligencia`)
│   │       ├── Studies.jsx                # Listas de acompanhamento e teses salvas (`/estudos`)
│   │       ├── Search.jsx                 # Página de resultados de busca (`/buscar`)
│   │       └── Sobre.jsx                  # Guia educativo e metodologia (`/sobre`)
│   └── tests/security.test.mjs            # 3 testes unitários de segurança frontend
│
└── engine/
    ├── Dockerfile                         # Python 3.12 Alpine, non-root UID 1000 (`botuser`), umask 002, loop 24h
    ├── db.py                              # Conexão SQLite WAL + schema idempotente
    ├── run_daily.py                       # Orquestrador CLI (--with-cvm, --send-telegram, --with-ai, --top N)
    ├── analyzer.py                        # Motor quantitativo (score 0-100, ranking setorial, alertas de deterioração)
    ├── ai_explainer.py                    # Resumo opcional com Gemini 2.5 Flash (header x-goog-api-key, grounded)
    ├── collectors/
    │   ├── bcb_collector.py               # Coleta Selic, IPCA 12m, IPCA mensal e Dólar PTAX (SGS)
    │   ├── market_collector.py            # Coleta ações, FIIs, ETFs e dividendos reais via brapi.dev
    │   ├── cvm_fii_collector.py           # Coleta Informe Mensal CVM de FIIs (P/VP e DY reais de FIIs líquidos)
    │   └── cvm_collector.py               # Coleta demonstrativos anuais CVM (DFP) via CSV/ZIP aberto
    ├── bot/
    │   ├── daily_bot.py                   # Gera relatório HTML escapado, salva histórico e envia no Telegram
    │   └── evaluator.py                   # Avalia retorno % e taxa de acerto das recomendações passadas
    └── tests/test_engine.py               # 4 testes unitários (scoring, pipeline, HTML escape, ISIN->FII)
```

---

## 4. Banco de Dados SQLite (`backend/data.db`)

Configurado com `PRAGMA journal_mode = WAL`, `busy_timeout = 5000` e `foreign_keys = ON`.

### Tabelas Existentes (todas devem manter compatibilidade retroativa)
1. **`investments`** *(legada)*: `id, symbol, quantity, avg_price, current_price`
2. **`stock_notes`**: `symbol (PK), thesis, risks, target_price, checklist (JSON), updated_at`
3. **`assets`**: `symbol (PK), name, asset_type ('stock'|'fii'|'etf'), sector, subsector, cnpj, logo, price, change_pct, volume, market_cap, source, updated_at`
4. **`fundamentals`**: `symbol (PK), pl, pvp, ev_ebitda, dy, roe, roa, roic, margem_liquida, margem_ebitda, divida_liquida, divida_liquida_ebitda, divida_liquida_pl, crescimento_receita, crescimento_lucro, receita_liquida, lucro_liquido, patrimonio_liquido, source, reference_date, updated_at`
5. **`price_history`**: `(symbol, date) PK, open, high, low, close, volume, source`
6. **`dividends`**: `(symbol, pay_date, type) PK, amount, source`
7. **`macro_indicators`**: `key (PK), name, value, unit, ref_date, source, updated_at`
8. **`watchlists`**: `id (PK), name (UNIQUE), created_at` *(seed default id=1: "Minha Lista Principal")*
9. **`watchlist_items`**: `(watchlist_id, symbol) PK, added_at` *(FK cascade)*
10. **`quant_rankings`**: `symbol (PK), score, classification, sector, sector_rank, valuation_score, profitability_score, dividend_score, debt_score, growth_score, deterioration_flags, positives, risks, explanation, criteria_json, updated_at`
11. **`bot_recommendations`**: `id (PK), run_date, symbol, asset_type, score, price_at_rec, classification, positives, risks, summary, delivered_telegram, current_price, return_pct, evaluated_at`

### Índices Analíticos Ativos
- `idx_assets_type_sector` em `assets(asset_type, sector)`
- `idx_bot_recs_date_score` em `bot_recommendations(run_date DESC, score DESC)`
- `idx_dividends_symbol_date` em `dividends(symbol, pay_date DESC)`
- `idx_quant_rankings_score` em `quant_rankings(score DESC)`

---

## 5. API REST (Backend — Porta `4000`)

### Endpoints Principais
- **Saúde e Telemetria**:
  - `GET /api/health` — status do processo e SQLite.
  - `GET /api/metrics` — métricas HTTP + taxa de acerto do cache (protegido por `METRICS_TOKEN` ou restrito a loopback em produção).
- **Mercado & Ativos**:
  - `GET /api/market` — resumo do mercado e termômetro B3.
  - `GET /api/macro` — Selic, IPCA 12m, IPCA mensal e Dólar PTAX (Banco Central SGS).
  - `GET /api/assets?type=stock|fii|etf&q=` — listagem unificada mesclada com fundamentos persistidos (incluindo P/VP e DY reais de FIIs da CVM).
  - `GET /api/assets/:symbol/dividends` — histórico real de proventos + resumo anual (com busca sob demanda e persistência assíncrona segura).
  - `GET /api/search?q=` — busca de ativos.
- **Indicadores & Comparação**:
  - `GET /api/indicators` — lista de ações com indicadores, Preço Justo (Graham/Bazin) e score de viabilidade.
  - `GET /api/indicators/:symbol` — dossiê fundamentalista completo de um ativo.
  - `GET /api/indicators/:symbol/history?range=1mo|3mo|6mo|1y` — série histórica **real** (nunca gera curva sintética).
  - `GET /api/rankings` — rankings temáticos.
- **Inteligência Quantitativa & Bot**:
  - `GET /api/intelligence/rankings` — ranking quantitativo transparente + alertas de deterioração.
  - `GET /api/intelligence/recommendations` — histórico do bot diário + retorno % e taxa de acerto.
  - `GET /api/intelligence/sector-peers/:symbol` — empresas pares do mesmo setor.
  - `POST /api/intelligence/run` — dispara `engine/run_daily.py` sob demanda (rate limit `6/min`, cooldown `30s`, exige `ADMIN_API_KEY` em produção; em desenvolvimento aceita apenas loopback sem chave; flags privilegiadas seguem a mesma política; fallback limpo `503` em Docker).
- **Estudos, Listas & Carteira**:
  - `GET / PUT /api/notes/:symbol` e `GET /api/notes` — Caderno de Tese.
  - `GET / POST / DELETE /api/watchlists` e `POST / DELETE /api/watchlists/:id/items/:symbol` — Listas de acompanhamento.
  - `GET / POST / PUT / DELETE /api/investments` e `GET /api/investments/summary` — CRUD completo da **Minha Carteira** (`/carteira`) com consolidação automática de preço médio ponderado, alocação por setor e dividendos estimados (100% retrocompatível com a tabela `investments`).

---

## 6. Segurança, Fontes Gratuitas & Variáveis de Ambiente

### Controles de Segurança já Implementados
- **Backend**: `x-powered-by` desabilitado, headers (`nosniff`, `DENY`, `Permissions-Policy`, `CORP`, `HSTS` em prod), `trust proxy = 1` em prod, CORS allowlist (em dev permite qualquer porta `localhost`/`127.0.0.1`; bloqueia origens externas com `403`), limite de payload `32KB`, validação estrita de ticker B3 (`normalizeTicker`), rate limiters separados para leitura (`180/min`), escrita (`40/min`) e execução do motor (`6/min`).
- **Frontend**: `safeHttpUrl` (bloqueia `javascript:`/`data:`), `escapeCsvCell` (protege contra CSV Formula Injection), CSP estrita no Nginx de produção (`script-src 'self'`), zero `dangerouslySetInnerHTML`.
- **Motor Python**: Gemini key via header `x-goog-api-key` (nunca na URL), Telegram com `parse_mode: "HTML"` e `html.escape()`, logs sem vazamento de segredos.
- **Docker**: containers `backend`, `frontend` e `engine` todos **non-root**; `backend` e `engine` alinhados no UID `1000`.

### Variáveis de Ambiente Opcionais (`backend/.env`)
Todas são opcionais para consulta do portal. Em produção, `ADMIN_API_KEY` é necessária apenas para disparar atualizações quantitativas remotamente:
```env
PORT=4000
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
# BRAPI_TOKEN=          # Gratuito em brapi.dev (sem token, histórico/dividendos gratuitos funcionam p/ PETR4, VALE3, ITUB4, MGLU3)
# BOLSAI_API_KEY=       # Gratuito (200 req/dia)
# TELEGRAM_BOT_TOKEN=   # Bot via @BotFather (gratuito)
# TELEGRAM_CHAT_ID=     # ID do chat/canal Telegram
# GEMINI_API_KEY=       # Opcional p/ resumo executivo via gemini-2.5-flash
# ADMIN_API_KEY=        # Obrigatória em produção para POST /api/intelligence/run
# METRICS_TOKEN=        # Proteção opcional p/ GET /api/metrics
```

---

## 7. Como Rodar e Validar Localmente

### Execução Local (Desenvolvimento)
```bash
# 1. Atualizar base de dados com o motor Python (opcional na 1ª vez; backend/data.db já está populado)
python3 engine/run_daily.py

# 2. Backend (Terminal 1 — porta 4000)
cd backend && npm install && npm run dev

# 3. Frontend (Terminal 2 — porta 3000 ou 3001)
cd frontend && npm install && npm run dev
```

### Execução via Docker Compose
```bash
docker compose up --build
# Frontend: http://localhost:3000 | Backend API: http://localhost:4000
```

### Suíte Completa de Testes (Estado Validado Atual)
```bash
cd backend && npm test                                # 18/18 testes passando
cd frontend && npm test && npm run build              # 3/3 testes + build Vite 7 + 0 vulns em prod
python3 -m unittest discover -s engine/tests -v       # 5/5 testes passando
```

---

## 8. Padrões de UI/UX & UX Writing (Seguir em Novas Telas)
- **Valores ausentes**: sempre exibir `—` (travessão), nunca `N/D`, `-` ou `NaN`.
- **Cabeçalho de página**: usar `<span className="page-eyebrow">...</span>` acima do `<h1>`.
- **Sem jargão de infraestrutura** na UI (ex.: dizer *"Base Fundamentalista"* / *"B3 ao vivo"* / *"Atualizar Análises"* em vez de `static-baseline`, `SQLite` ou `Motor Python`).
- **KPI Strip**: páginas analíticas usam faixa de cards executivos com `borderTop: '3px solid ...'` e números com classe `.num` (`tabular-nums`).
- **Acessibilidade**: botões só com ícone devem ter `aria-label`; abas usam `role="tablist"` / `role="tab"` / `role="tabpanel"` com navegação por setas.

---

## 9. Próximas Evoluções Sugeridas (Backlog)
1. **Coleta CVM DFP automática semanal**: agendar `--with-cvm` no container `engine` para enriquecer automaticamente demonstrativos oficiais de mais empresas da B3 e exibir data de atualização por fonte na tela `/inteligencia`.
2. **Exportação de Relatório PDF / Impressão limpa (`@media print`)**: gerar ficha fundamentalista imprimível na página de detalhe do ativo (`/acoes/:symbol`) e no comparador (`/comparar`).
3. **Alertas de Preço-Alvo no Telegram**: cruzar `stock_notes.target_price` com cotações ao vivo no `daily_bot.py` para avisar quando uma ação estudada ficar abaixo do preço-teto definido pelo usuário.

