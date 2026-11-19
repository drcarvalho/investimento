// Guard non-critical DB or upstream calls with a strict timeout + fallback value
// so a slow or paused database/API never hangs serverless responses.
function withTimeout(promise, ms, fallback) {
  let timer;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
    if (timer.unref) timer.unref();
  });

  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    timeoutPromise,
  ]).finally(() => clearTimeout(timer));
}

module.exports = { withTimeout };
