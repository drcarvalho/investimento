const express = require('express');
const cors = require('cors');
const {
  securityHeaders,
  writeAccessGuard,
  getCorsOptions,
  createRateLimiter,
  timingSafeEqualStr,
  isLoopbackIp,
} = require('./middleware/security');
const { requestObservability, getRequestMetrics } = require('./middleware/observability');
const { attachOptionalUser, getAuthStatus } = require('./middleware/auth');
const { getCacheStats } = require('./services/brapi');
const { getBcbStats } = require('./services/bcb');
const db = require('./models/db');
const investmentsRouter = require('./routes/investments');
const rankingsRouter = require('./routes/rankings');
const indicatorsRouter = require('./routes/indicators');
const searchRouter = require('./routes/search');
const marketRouter = require('./routes/market');
const notesRouter = require('./routes/notes');
const assetsRouter = require('./routes/assets');
const watchlistsRouter = require('./routes/watchlists');
const intelligenceRouter = require('./routes/intelligence');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
  }

  app.use(requestObservability);
  app.use(securityHeaders);
  app.use(cors(getCorsOptions()));
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '32kb' }));

  const readLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 180 });
  const writeLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 40 });
  const engineRunLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 6 });

  app.use('/api', attachOptionalUser);
  app.use('/api', readLimiter);
  app.use('/api/intelligence/run', engineRunLimiter);
  for (const writePrefix of ['/api/notes', '/api/watchlists', '/api/investments', '/api/intelligence/run']) {
    app.use(writePrefix, (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return writeLimiter(req, res, next);
      }
      return next();
    });
  }
  for (const protectedWrite of ['/api/notes', '/api/watchlists', '/api/investments']) {
    app.use(protectedWrite, writeAccessGuard);
  }

  app.use('/api/investments', investmentsRouter);
  app.use('/api/rankings', rankingsRouter);
  app.use('/api/indicators', indicatorsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/market', marketRouter);
  app.use('/api/notes', notesRouter);
  app.use('/api/watchlists', watchlistsRouter);
  app.use('/api/intelligence', intelligenceRouter);
  app.use('/api', assetsRouter); // /api/macro, /api/assets, /api/assets/:symbol/dividends

  app.get('/api/auth/status', (req, res) => {
    res.json({
      ...getAuthStatus(),
      authenticated: Boolean(req.user),
      user: req.user ? { id: req.user.id, email: req.user.email } : null,
    });
  });

  app.get('/api/health', async (req, res) => {
    try {
      const dbOk = await db.checkHealth();
      res.status(dbOk ? 200 : 503).json({
        status: dbOk ? 'ok' : 'degraded',
        db: dbOk ? 'connected' : 'error',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({
        status: 'degraded',
        db: 'error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.get('/api/metrics', (req, res) => {
    const expectedToken = (process.env.METRICS_TOKEN || '').trim();
    if (expectedToken) {
      const provided =
        req.headers['x-metrics-token'] ||
        (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : '');
      if (!timingSafeEqualStr(provided, expectedToken)) {
        return res.status(401).json({ error: 'Token de métricas inválido ou ausente' });
      }
    } else if (process.env.NODE_ENV === 'production' && !isLoopbackIp(req.ip)) {
      return res.status(403).json({ error: 'Endpoint de métricas restrito em produção' });
    }

    res.json({
      http: getRequestMetrics(),
      brapiCache: getCacheStats(),
      bcb: getBcbStats(),
    });
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
  });

  app.use((err, req, res, next) => {
    if (err && err.message === 'Origin not allowed by CORS') {
      return res.status(403).json({ error: 'Origem não permitida' });
    }
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({ error: 'JSON malformado no corpo da requisição' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Payload excede o limite permitido (32KB)' });
    }
    console.error('Unhandled backend error:', err?.message || err);
    return res.status(500).json({ error: 'Erro interno no servidor' });
  });

  return app;
}

module.exports = { createApp };
