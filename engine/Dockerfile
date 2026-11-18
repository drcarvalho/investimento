# Lightweight Python 3.12 container for scheduled Quant Engine & Daily Bot
FROM python:3.12-alpine
WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV DB_PATH=/app/data/data.db

COPY engine ./engine
COPY backend/src/data/indicators-static.json ./backend/src/data/indicators-static.json

# Align UID 1000 with backend's `node` user so both share SQLite WAL volume cleanly
RUN adduser -D -u 1000 botuser && mkdir -p /app/data && chown -R botuser:botuser /app
USER botuser

HEALTHCHECK --interval=60s --timeout=5s --start-period=15s --retries=3 \
  CMD python3 -c "import os, sqlite3; c=sqlite3.connect(os.environ.get('DB_PATH', '/app/data/data.db')); c.execute('SELECT 1'); c.close()" || exit 1

# Graceful SIGTERM/SIGINT handling so container stops immediately instead of hanging on sleep
CMD ["sh", "-c", "umask 002; trap 'exit 0' TERM INT; while true; do python3 engine/run_daily.py ${BOT_FLAGS:-} || true; sleep 86400 & wait $!; done"]
