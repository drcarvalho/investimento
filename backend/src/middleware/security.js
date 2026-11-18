const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function isLoopbackIp(ip) {
  if (!ip) return false;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

// Lightweight .env loader (does not overwrite existing process.env vars)
function loadEnvFile() {
  const envPath = path.resolve(__dirname, '../../.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch (err) {
    console.warn('Could not read .env file:', err.message);
  }
}

// Security headers (defense-in-depth without external deps)
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  const isHttps = Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https');
  if (process.env.NODE_ENV === 'production' && isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

// Optional protection for write endpoints in public deployments (local/personal stays open by default)
function writeAccessGuard(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  if (String(process.env.READ_ONLY_MODE || '').toLowerCase() === 'true') {
    return res.status(403).json({ error: 'Portal em modo somente leitura' });
  }
  const expectedKey = (process.env.WRITE_API_KEY || '').trim();
  if (expectedKey) {
    const provided =
      req.headers['x-api-key'] ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : '');
    if (!timingSafeEqualStr(provided, expectedKey)) {
      return res.status(401).json({ error: 'Chave de escrita inválida ou ausente (X-API-Key)' });
    }
  }
  return next();
}

// Strict CORS origin allowlist (also allows any localhost/127.0.0.1 port in dev and Vercel deployment URLs)
function getCorsOptions() {
  const raw = process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000';
  const allowlist = new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (host && typeof host === 'string') {
      const clean = host.trim().replace(/^https?:\/\//i, '');
      if (clean) allowlist.add(`https://${clean}`);
    }
  }
  const localDevOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

  return {
    origin(origin, callback) {
      if (!origin || allowlist.has(origin)) {
        return callback(null, true);
      }
      if (process.env.NODE_ENV !== 'production' && localDevOrigin.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origin not allowed by CORS'));
    },
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Metrics-Token'],
    maxAge: 600,
  };
}

// In-memory rate limiter with bounded bucket cleanup
function createRateLimiter({ windowMs = 60 * 1000, max = 120, maxBuckets = 10_000 } = {}) {
  const buckets = new Map();

  // Periodic cleanup to avoid unbounded memory growth
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of buckets.entries()) {
      if (now >= entry.resetAt) buckets.delete(ip);
    }
  }, windowMs);
  if (timer.unref) timer.unref();

  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = buckets.get(ip);

    if (!entry || now >= entry.resetAt) {
      if (!entry && buckets.size >= maxBuckets) {
        const oldestIp = buckets.keys().next().value;
        if (oldestIp !== undefined) buckets.delete(oldestIp);
      }
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(ip, entry);
    }

    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Muitas requisições. Tente novamente em instantes.',
        retryAfterSeconds: retryAfter,
      });
    }

    next();
  };
}

module.exports = {
  loadEnvFile,
  securityHeaders,
  writeAccessGuard,
  getCorsOptions,
  createRateLimiter,
  timingSafeEqualStr,
  isLoopbackIp,
};

