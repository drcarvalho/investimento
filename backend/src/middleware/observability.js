const crypto = require('crypto');

const MAX_LATENCY_SAMPLES = 500;
const metrics = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  totalDurationMs: 0,
  statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
  latencySamples: [],
  latencyCursor: 0,
};

function recordLatency(durationMs) {
  if (metrics.latencySamples.length < MAX_LATENCY_SAMPLES) {
    metrics.latencySamples.push(durationMs);
  } else {
    metrics.latencySamples[metrics.latencyCursor] = durationMs;
    metrics.latencyCursor = (metrics.latencyCursor + 1) % MAX_LATENCY_SAMPLES;
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[idx].toFixed(1));
}

function requestObservability(req, res, next) {
  const requestId = crypto.randomUUID();
  const start = process.hrtime.bigint();
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const status = res.statusCode;

    metrics.totalRequests += 1;
    metrics.totalDurationMs += durationMs;
    recordLatency(durationMs);
    const bucket = `${Math.floor(status / 100)}xx`;
    if (bucket in metrics.statusCounts) {
      metrics.statusCounts[bucket] += 1;
    }

    if (process.env.NODE_ENV !== 'test') {
      // Structured JSON log (never log Authorization headers or request bodies)
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
          requestId,
          method: req.method,
          path: (req.originalUrl || req.url || req.path || '/').split('?')[0],
          status,
          durationMs: Number(durationMs.toFixed(1)),
        })
      );
    }
  });

  next();
}

function getRequestMetrics() {
  const avgLatencyMs =
    metrics.totalRequests > 0
      ? Number((metrics.totalDurationMs / metrics.totalRequests).toFixed(1))
      : 0;
  const sorted = [...metrics.latencySamples].sort((a, b) => a - b);

  return {
    startedAt: metrics.startedAt,
    uptimeSeconds: Math.floor(process.uptime()),
    totalRequests: metrics.totalRequests,
    avgLatencyMs,
    p50LatencyMs: percentile(sorted, 50),
    p95LatencyMs: percentile(sorted, 95),
    p99LatencyMs: percentile(sorted, 99),
    statusCounts: { ...metrics.statusCounts },
    memoryRssMb: Number((process.memoryUsage().rss / (1024 * 1024)).toFixed(1)),
  };
}

module.exports = {
  requestObservability,
  getRequestMetrics,
};

