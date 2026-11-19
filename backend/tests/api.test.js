const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

// Isolate SQLite test database before importing app/db
const tmpDb = path.join(os.tmpdir(), `investanalytics-test-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = tmpDb;
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.TRUST_PROXY = '1';

const { createApp } = require('../src/app');
const db = require('../src/models/db');
const { getBrapiHeaders } = require('../src/services/brapi');

let server;
let baseUrl;

test.before(async () => {
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.closeGracefully();
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(`${tmpDb}${suffix}`);
    } catch {}
  }
});

test('GET /api/health returns 200 with DB connected and security headers', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.ok(res.headers.get('x-request-id'));
  assert.ok(res.headers.get('x-ratelimit-limit'));

  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.db, 'connected');
});

test('GET /api/metrics exposes HTTP and cache telemetry', async () => {
  const res = await fetch(`${baseUrl}/api/metrics`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.http.totalRequests >= 1);
  assert.equal(typeof body.brapiCache.hitRatePct, 'number');
});

test('CORS allows localhost origins in non-prod and blocks external origins', async () => {
  const okRes = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'http://localhost:3001' },
  });
  assert.equal(okRes.status, 200);
  assert.equal(okRes.headers.get('access-control-allow-origin'), 'http://localhost:3001');

  const blockedRes = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'https://evil.example' },
  });
  assert.equal(blockedRes.status, 403);
});

test('API rejects invalid tickers, malformed JSON, and oversized payloads', async () => {
  const badTicker = await fetch(`${baseUrl}/api/indicators/..%2Fetc`);
  assert.equal(badTicker.status, 400);

  const badJson = await fetch(`${baseUrl}/api/notes/PETR4`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: '{invalid json',
  });
  assert.equal(badJson.status, 400);

  const hugePayload = await fetch(`${baseUrl}/api/notes/PETR4`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thesis: 'A'.repeat(40 * 1024) }),
  });
  assert.equal(hugePayload.status, 413);

  const notFound = await fetch(`${baseUrl}/api/does-not-exist`);
  assert.equal(notFound.status, 404);
});

test('PUT & GET /api/notes/:symbol persists study notes in SQLite', async () => {
  const putRes = await fetch(`${baseUrl}/api/notes/VALE3`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      thesis: 'Baixo custo de extracao',
      risks: 'Preco do minerio na China',
      target_price: 72.5,
      checklist: [{ text: 'Avaliei divida liquida', done: true }],
    }),
  });
  assert.equal(putRes.status, 200);

  const getRes = await fetch(`${baseUrl}/api/notes/VALE3`);
  assert.equal(getRes.status, 200);
  const data = await getRes.json();
  assert.equal(data.symbol, 'VALE3');
  assert.equal(data.thesis, 'Baixo custo de extracao');
  assert.equal(data.target_price, 72.5);
  assert.equal(data.checklist.length, 1);
  assert.equal(data.checklist[0].done, true);
});

test('Watchlists CRUD persists multiple lists and items in SQLite', async () => {
  const listRes = await fetch(`${baseUrl}/api/watchlists`);
  assert.equal(listRes.status, 200);
  const lists = await listRes.json();
  assert.ok(lists.length >= 1);

  const createRes = await fetch(`${baseUrl}/api/watchlists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Dividendos 2026' }),
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();

  const addRes = await fetch(`${baseUrl}/api/watchlists/${created.id}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol: 'bbas3' }),
  });
  assert.equal(addRes.status, 201);

  const afterRes = await fetch(`${baseUrl}/api/watchlists`);
  const afterLists = await afterRes.json();
  const found = afterLists.find((l) => l.id === created.id);
  assert.deepEqual(found.symbols, ['BBAS3']);
});

test('Intelligence endpoints return transparent rankings and recommendations schemas', async () => {
  const rk = await fetch(`${baseUrl}/api/intelligence/rankings`);
  assert.equal(rk.status, 200);
  const rkBody = await rk.json();
  assert.ok(Array.isArray(rkBody.rankings));
  assert.ok(rkBody.disclaimer.includes('informativa'));

  const rc = await fetch(`${baseUrl}/api/intelligence/recommendations`);
  assert.equal(rc.status, 200);
  const rcBody = await rc.json();
  assert.ok(Array.isArray(rcBody.recommendations));

  const peers = await fetch(`${baseUrl}/api/intelligence/sector-peers/ITUB4`);
  assert.equal(peers.status, 200);
  const peersBody = await peers.json();
  assert.equal(peersBody.symbol, 'ITUB4');
  assert.ok(peersBody.peers.length >= 1);
});

test('SQLite creates analytical performance indexes', async () => {
  const idxRows = await db.allAsync("SELECT name FROM sqlite_master WHERE type='index'");
  const names = new Set(idxRows.map((r) => r.name));
  assert.ok(names.has('idx_assets_type_sector'));
  assert.ok(names.has('idx_bot_recs_date_score'));
  assert.ok(names.has('idx_dividends_symbol_date'));
  assert.ok(names.has('idx_quant_rankings_score'));
});

test('GET /api/metrics enforces METRICS_TOKEN when configured', async () => {
  process.env.METRICS_TOKEN = 'secret-metrics-123';
  try {
    const unauth = await fetch(`${baseUrl}/api/metrics`);
    assert.equal(unauth.status, 401);

    const auth = await fetch(`${baseUrl}/api/metrics`, {
      headers: { 'x-metrics-token': 'secret-metrics-123' },
    });
    assert.equal(auth.status, 200);
  } finally {
    delete process.env.METRICS_TOKEN;
  }
});

test('POST /api/intelligence/run enforces ADMIN_API_KEY independently of WRITE_API_KEY and honors READ_ONLY_MODE', async () => {
  process.env.ADMIN_API_KEY = 'secret-admin-456';
  process.env.WRITE_API_KEY = 'different-write-789';
  try {
    const unauth = await fetch(`${baseUrl}/api/intelligence/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'different-write-789' },
      body: JSON.stringify({}),
    });
    assert.equal(unauth.status, 401);

    process.env.READ_ONLY_MODE = 'true';
    const ro = await fetch(`${baseUrl}/api/intelligence/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'secret-admin-456' },
      body: JSON.stringify({}),
    });
    assert.equal(ro.status, 403);
  } finally {
    delete process.env.ADMIN_API_KEY;
    delete process.env.WRITE_API_KEY;
    delete process.env.READ_ONLY_MODE;
  }
});

test('POST /api/intelligence/run rejects external callers when no ADMIN_API_KEY is configured', async () => {
  const res = await fetch(`${baseUrl}/api/intelligence/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '203.0.113.50',
    },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 401);
});

test('POST /api/intelligence/run requires a key in production even from loopback', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const res = await fetch(`${baseUrl}/api/intelligence/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 401);
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test('brapi token is sent exclusively in the Authorization header', () => {
  const previous = process.env.BRAPI_TOKEN;
  process.env.BRAPI_TOKEN = 'test-token';
  try {
    assert.deepEqual(getBrapiHeaders(), {
      Accept: 'application/json',
      Authorization: 'Bearer test-token',
    });
  } finally {
    if (previous === undefined) delete process.env.BRAPI_TOKEN;
    else process.env.BRAPI_TOKEN = previous;
  }
});

test('CORS preflight allows X-API-Key and X-Metrics-Token headers', async () => {
  const res = await fetch(`${baseUrl}/api/metrics`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:3000',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'X-API-Key, X-Metrics-Token',
    },
  });
  assert.equal(res.status, 204);
  const allowed = (res.headers.get('access-control-allow-headers') || '').toLowerCase();
  assert.ok(allowed.includes('x-api-key'));
  assert.ok(allowed.includes('x-metrics-token'));
});

test('Investments CRUD persists positions, consolidates weighted average, and computes summary', async () => {
  const bad = await fetch(`${baseUrl}/api/investments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol: 'INVALID!!', quantity: 10, avg_price: 20 }),
  });
  assert.equal(bad.status, 400);

  const first = await fetch(`${baseUrl}/api/investments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol: 'petr4', quantity: 100, avg_price: 30 }),
  });
  assert.equal(first.status, 201);
  const created = await first.json();
  assert.equal(created.symbol, 'PETR4');
  assert.equal(created.quantity, 100);
  assert.equal(created.avg_price, 30);

  // Consolidate second buy: 100 @ 30 + 100 @ 40 => 200 @ 35
  const second = await fetch(`${baseUrl}/api/investments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol: 'PETR4', quantity: 100, avg_price: 40 }),
  });
  assert.equal(second.status, 200);
  const merged = await second.json();
  assert.equal(merged.consolidated, true);
  assert.equal(merged.quantity, 200);
  assert.equal(merged.avg_price, 35);

  // Update exact values
  const upd = await fetch(`${baseUrl}/api/investments/${created.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity: 150, avg_price: 36.5 }),
  });
  assert.equal(upd.status, 200);

  // Summary endpoint
  const sumRes = await fetch(`${baseUrl}/api/investments/summary`);
  assert.equal(sumRes.status, 200);
  const sumBody = await sumRes.json();
  assert.equal(sumBody.summary.assetCount, 1);
  assert.equal(sumBody.summary.totalCost, 5475);
  assert.ok(Array.isArray(sumBody.bySector) && sumBody.bySector.length === 1);

  // Delete position
  const del = await fetch(`${baseUrl}/api/investments/${created.id}`, { method: 'DELETE' });
  assert.equal(del.status, 200);
});

test('DELETE /api/watchlists/:id returns 404 for unknown list and protects default list', async () => {
  const protectDefault = await fetch(`${baseUrl}/api/watchlists/1`, { method: 'DELETE' });
  assert.equal(protectDefault.status, 400);

  const missing = await fetch(`${baseUrl}/api/watchlists/999999`, { method: 'DELETE' });
  assert.equal(missing.status, 404);
});

test('GET /api/metrics exposes P50/P95/P99 latency percentiles and provider telemetry', async () => {
  const res = await fetch(`${baseUrl}/api/metrics`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(typeof body.http.p50LatencyMs, 'number');
  assert.equal(typeof body.http.p95LatencyMs, 'number');
  assert.equal(typeof body.http.p99LatencyMs, 'number');
  assert.equal(typeof body.brapiCache.coalescedHits, 'number');
  assert.equal(typeof body.bcb.requests, 'number');
});

test('fetchWithCoalescing deduplicates concurrent upstream fetches for the same key', async () => {
  const { fetchWithCoalescing } = require('../src/services/brapi');
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 25));
    return { ok: true, n: calls };
  };
  const key = `test_coalesce_${Date.now()}`;
  const [a, b, c] = await Promise.all([
    fetchWithCoalescing(key, 10_000, fetcher),
    fetchWithCoalescing(key, 10_000, fetcher),
    fetchWithCoalescing(key, 10_000, fetcher),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
});

test('READ_ONLY_MODE and WRITE_API_KEY optionally protect write routes', async () => {
  const prevRo = process.env.READ_ONLY_MODE;
  const prevKey = process.env.WRITE_API_KEY;
  try {
    process.env.READ_ONLY_MODE = 'true';
    const roRes = await fetch(`${baseUrl}/api/notes/PETR4`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thesis: 'blocked' }),
    });
    assert.equal(roRes.status, 403);

    delete process.env.READ_ONLY_MODE;
    process.env.WRITE_API_KEY = 'secret-write-key';
    const noKey = await fetch(`${baseUrl}/api/notes/PETR4`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thesis: 'needs key' }),
    });
    assert.equal(noKey.status, 401);

    const withKey = await fetch(`${baseUrl}/api/notes/PETR4`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'secret-write-key' },
      body: JSON.stringify({ thesis: 'authorized write' }),
    });
    assert.equal(withKey.status, 200);
  } finally {
    if (prevRo === undefined) delete process.env.READ_ONLY_MODE;
    else process.env.READ_ONLY_MODE = prevRo;
    if (prevKey === undefined) delete process.env.WRITE_API_KEY;
    else process.env.WRITE_API_KEY = prevKey;
  }
});

test('HSTS header is sent only over HTTPS in production', async () => {
  const prevEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const httpRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(httpRes.headers.get('strict-transport-security'), null);

    const httpsRes = await fetch(`${baseUrl}/api/health`, {
      headers: { 'X-Forwarded-Proto': 'https' },
    });
    assert.ok((httpsRes.headers.get('strict-transport-security') || '').includes('max-age='));
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});

test('convertPlaceholders converts SQLite ? to PostgreSQL $n safely outside string literals', () => {
  const db = require('../src/models/db');
  const converted = db.convertPlaceholders(
    "SELECT * FROM notes WHERE symbol = ? AND thesis != 'what?' AND price > ?"
  );
  assert.equal(
    converted,
    "SELECT * FROM notes WHERE symbol = $1 AND thesis != 'what?' AND price > $2"
  );
});

test('resolvePostgresUrl and sanitizePgConnectionString support Vercel Storage POSTGRES_URL', () => {
  const db = require('../src/models/db');
  const url = db.resolvePostgresUrl({
    POSTGRES_URL: 'postgres://user:pass@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x',
  });
  assert.ok(url.startsWith('postgres://'));

  const sanitized = db.sanitizePgConnectionString(url);
  assert.equal(sanitized.isLocal, false);
  assert.ok(!sanitized.connectionString.includes('supa='));
  assert.ok(!sanitized.connectionString.includes('sslmode='));
});


test('GET /api/intelligence/fii-rankings and /api/assets/:symbol/events return valid schemas', async () => {
  const fiiRes = await fetch(`${baseUrl}/api/intelligence/fii-rankings`);
  assert.equal(fiiRes.status, 200);
  const fiiBody = await fiiRes.json();
  assert.ok(Array.isArray(fiiBody.rankings));
  assert.ok(Array.isArray(fiiBody.segments));

  const evRes = await fetch(`${baseUrl}/api/assets/PETR4/events`);
  assert.equal(evRes.status, 200);
  const evBody = await evRes.json();
  assert.equal(evBody.symbol, 'PETR4');
  assert.ok(Array.isArray(evBody.events));
});

test('GET /api/auth/status and verifySupabaseJwt validate HS256 tokens cleanly', async () => {
  const crypto = require('crypto');
  const { verifySupabaseJwt } = require('../src/middleware/auth');

  const statusRes = await fetch(`${baseUrl}/api/auth/status`);
  assert.equal(statusRes.status, 200);
  const statusBody = await statusRes.json();
  assert.equal(statusBody.provider, 'supabase');

  const secret = 'test-supabase-jwt-secret';
  const b64u = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const head = b64u({ alg: 'HS256', typ: 'JWT' });
  const payload = b64u({ sub: 'user-123', email: 'invest@example.com', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${payload}`).digest('base64url');
  const token = `${head}.${payload}.${sig}`;

  const verified = verifySupabaseJwt(token, secret);
  assert.equal(verified.id, 'user-123');
  assert.equal(verified.email, 'invest@example.com');
  assert.equal(verifySupabaseJwt(token, 'wrong-secret'), null);
});
