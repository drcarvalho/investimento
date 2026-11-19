const crypto = require('crypto');

function base64UrlDecode(segment) {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf8');
}

function base64UrlSignHmacSha256(input, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(input)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Zero-dependency HS256 JWT verification compatible with Supabase Auth access tokens
function verifySupabaseJwt(token, secret) {
  if (typeof token !== 'string' || typeof secret !== 'string' || !token || !secret) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signature] = parts;
  try {
    const header = JSON.parse(base64UrlDecode(headerB64));
    if (header.alg !== 'HS256') return null;

    const expectedSig = base64UrlSignHmacSha256(`${headerB64}.${payloadB64}`, secret);
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(payloadB64));
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < nowSec) {
      return null;
    }
    if (typeof payload.nbf === 'number' && payload.nbf > nowSec) {
      return null;
    }
    if (!payload.sub) return null;

    return {
      id: String(payload.sub),
      email: payload.email || null,
      role: payload.role || 'authenticated',
    };
  } catch {
    return null;
  }
}

function getAuthStatus() {
  const jwtSecret = (process.env.SUPABASE_JWT_SECRET || '').trim();
  const requireAuth = String(process.env.REQUIRE_USER_AUTH || '').toLowerCase() === 'true';
  return {
    multiUserEnabled: Boolean(jwtSecret),
    enforced: Boolean(jwtSecret && requireAuth),
    provider: 'supabase',
  };
}

function attachOptionalUser(req, res, next) {
  const secret = (process.env.SUPABASE_JWT_SECRET || '').trim();
  if (!secret) return next();

  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const user = verifySupabaseJwt(token, secret);
    if (user) {
      req.user = user;
    }
  }
  return next();
}

function requireAuthIfEnabled(req, res, next) {
  const status = getAuthStatus();
  if (!status.enforced) return next();
  if (!req.user) {
    return res.status(401).json({ error: 'Autenticação obrigatória para acessar este recurso.' });
  }
  return next();
}

module.exports = {
  verifySupabaseJwt,
  attachOptionalUser,
  requireAuthIfEnabled,
  getAuthStatus,
};
