// Zero-dependency L2 distributed cache adapter for Upstash Redis REST API (Vercel Free Tier friendly).
// Automatically becomes a silent no-op when UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are unset.

function getUpstashConfig() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, '');
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!url || !token) return null;
  return { url, token };
}

function isDistributedCacheEnabled() {
  return Boolean(getUpstashConfig());
}

async function distributedGet(key) {
  const cfg = getUpstashConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/get/${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(2500),
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || json.result == null) return null;
    return JSON.parse(json.result);
  } catch {
    return null;
  }
}

async function distributedSet(key, data, ttlMs) {
  const cfg = getUpstashConfig();
  if (!cfg) return;
  const ttlSec = Math.max(10, Math.ceil((ttlMs || 60000) / 1000));
  try {
    await fetch(`${cfg.url}/set/${encodeURIComponent(key)}?EX=${ttlSec}`, {
      method: 'POST',
      signal: AbortSignal.timeout(2500),
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: JSON.stringify(data),
    });
  } catch {
    // Non-fatal: local L1 memory cache remains active
  }
}

module.exports = {
  isDistributedCacheEnabled,
  distributedGet,
  distributedSet,
};
