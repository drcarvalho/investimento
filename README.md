# InvestAnalytics — Portal de Inteligência Financeira (B3)

Plataforma completa e gratuita de inteligência financeira, análise fundamentalista e acompanhamento do mercado brasileiro (**Ações, FIIs, ETFs e Macroeconomia**).

## Recursos Principais

- **Dashboard de Mercado (`/`)**: Painel macro oficial do **Banco Central (Selic, IPCA 12m, IPCA mensal, Dólar PTAX)**, termômetro da B3, **Mapa de Calor B3**, cotações em destaque com posição intradiária real e rankings clicáveis.
- **Screening de Ações (`/acoes`)**: Filtros fundamentalistas (P/L, P/VP, DY, ROE, setor, viabilidade), modo compacto/confortável, filtros salvos e exportação CSV segura.
- **FIIs & ETFs (`/ativos`)**: Listagem em tempo real de Fundos Imobiliários e ETFs da B3 com busca e ordenação (sem inventar indicadores indisponíveis — exibidos como `—`).
- **Análise por Ativo (`/acoes/:symbol`)**: Gráfico histórico real (`1M / 3M / 6M / 1A`) com volume e tooltip flutuante, indicadores completos com tooltips educativos, barras visuais de demonstrativos financeiros, Preço Justo (Graham & Bazin), Simulador de Dividendos/Juros Compostos (com gráfico ano a ano) e Caderno de Tese em SQLite.
- **Comparador Avançado (`/comparar`)**: Até **5 ativos simultâneos** (P/L, P/VP, ROE, ROIC, Margem Líquida, DY, Crescimento de Receita/Lucro, Dívida Líquida), botão **"Pares do setor"**, gráfico de **evolução histórica comparada (retorno %)**, gráfico Radar e interpretação objetiva.
- **Inteligência Quantitativa & Bot Diário (`/inteligencia`)**: Motor próprio em **Python 3** com ranking transparente em 5 pilares, alertas de deterioração de resultados, histórico de sugestões diárias e avaliação de desempenho posterior.
- **Meus Estudos & Listas (`/estudos`)**: Central de teses salvas + múltiplas listas de acompanhamento persistidas em SQLite.
- **Command Palette (`Ctrl+K` ou `/`)** e **Modo Claro / Escuro**.

---

## Fontes de Dados Gratuitas (Custo Zero)

| Fonte | Uso no Projeto | Chave Necessária |
|---|---|---|
| **Banco Central (SGS)** | Meta Selic (`432`), IPCA 12m (`13522`), IPCA mensal (`433`), Dólar PTAX (`10813`) | Não (ODbL, livre) |
| **CVM Dados Abertos** | Balanços oficiais anuais **DFP** (DRE / Patrimônio Líquido) via `engine/collectors/cvm_collector.py` | Não (ODbL, livre) |
| **brapi.dev** | Cotações e listagens de Ações, FIIs e ETFs + 4 ativos completos sem token | Opcional (`BRAPI_TOKEN`) |
| **bolsai.com** *(opcional)* | Enriquecimento complementar de fundamentos (200 req/dia free, cache 24h) | Opcional (`BOLSAI_API_KEY`) |
| **Telegram Bot API** *(opcional)* | Envio do relatório diário do bot | Opcional (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) |

---

## Como Rodar Localmente

### 1. Instalar dependências (Node 20+ e Python 3.12+)
```bash
cd backend && npm install
cd ../frontend && npm install
```
*(O motor em Python usa apenas a biblioteca padrão do Python 3.12 — zero `pip install` necessário!)*

### 2. Configurar variáveis de ambiente (opcional)
```bash
cp backend/.env.example backend/.env
```

> Em produção, defina uma `ADMIN_API_KEY` forte. O disparo remoto de atualizações quantitativas exige essa chave; sem ela, o endpoint fica restrito ao uso local em desenvolvimento.

### 3. Executar o Motor Quantitativo & Bot Diário (Python)
```bash
# Coleta BCB + brapi, calcula ranking quantitativo, avalia retornos e gera relatório do dia
python3 engine/run_daily.py

# Também baixar e processar DFP oficial da CVM (receita, lucro, ROE, crescimento)
python3 engine/run_daily.py --with-cvm

# Enviar o relatório diário para o Telegram (requer TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no backend/.env)
python3 engine/run_daily.py --send-telegram
```

> Para agendar diariamente no Linux (`cron`, ex.: seg–sex às 18:30 após fechamento da B3):
> ```cron
> 30 18 * * 1-5 cd "/home/daniel/Área de trabalho/investimento" && python3 engine/run_daily.py --send-telegram >> /tmp/investanalytics-bot.log 2>&1
> ```

### 4. Iniciar Backend e Frontend
```bash
# Terminal 1 — Backend (porta 4000)
cd backend && npm run dev

# Terminal 2 — Frontend (porta 3000)
cd frontend && npm run dev
```

### Ou via Docker Compose
```bash
docker compose up --build
```

---

## Executar Todos os Testes

```bash
cd backend && npm test
cd frontend && npm test && npm run build
python3 -m unittest discover -s engine/tests -v
```

---

## Endpoints da API

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/macro` | Selic, IPCA 12m, IPCA mensal e Dólar PTAX (BCB SGS, cache SQLite) |
| `GET` | `/api/market` | Termômetro B3, altas, baixas, volume e Mapa de Calor |
| `GET` | `/api/assets?type=fii\|etf\|stock` | Listagem unificada de FIIs, ETFs e Ações |
| `GET` | `/api/assets/:symbol/dividends` | Histórico real de dividendos armazenados |
| `GET` | `/api/indicators` | Screening completo (preços ao vivo + fundamentos SQLite) |
| `GET` | `/api/indicators/:symbol` | Análise detalhada (Ações, FIIs e ETFs) |
| `GET` | `/api/indicators/:symbol/history?range=3mo` | Histórico real OHLCV (nunca simulado) |
| `GET` | `/api/intelligence/rankings` | Ranking quantitativo Python + alertas de deterioração |
| `GET` | `/api/intelligence/recommendations` | Histórico do bot diário + avaliação de desempenho |
| `GET` | `/api/intelligence/sector-peers/:symbol` | Pares do mesmo setor para comparação |
| `GET/POST/DELETE` | `/api/watchlists` | Múltiplas listas de acompanhamento (SQLite) |
| `GET/PUT` | `/api/notes/:symbol` | Caderno de tese, riscos, preço-alvo e checklist (SQLite) |
| `GET` | `/api/health` / `/api/metrics` | Saúde real do SQLite + latência e taxa de cache |
