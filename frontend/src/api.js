export const API_BASE =
  import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : '';

// Coalesce identical concurrent GET requests (e.g., TickerTape + Home fetching /api/market at the same time)
const inFlightGets = new Map();

function raceWithSignal(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (val) => {
        signal.removeEventListener('abort', onAbort);
        resolve(val);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

async function performFetch(url, options) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs || 10000);

  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    const { timeoutMs, ...fetchOpts } = options;
    const headers = new Headers(fetchOpts.headers || {});
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    const res = await fetch(url, {
      ...fetchOpts,
      signal: controller.signal,
      headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        typeof data.error === 'string'
          ? data.error
          : (data.error?.message || data.message || `Erro HTTP ${res.status}`);
      throw new Error(msg);
    }
    return data;
  } catch (err) {
    if (timedOut) {
      throw new Error('Tempo limite excedido ao consultar o servidor. Tente novamente em instantes.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const method = (options.method || 'GET').toUpperCase();
  const canCoalesce = method === 'GET' && !options.headers && !options.body;

  if (canCoalesce) {
    const existing = inFlightGets.get(url);
    if (existing) {
      return raceWithSignal(existing, options.signal);
    }
    // Shared fetch runs without caller's AbortSignal so one unmounting component never cancels another consumer
    const { signal, ...sharedOpts } = options;
    const sharedPromise = performFetch(url, sharedOpts).finally(() => {
      inFlightGets.delete(url);
    });
    inFlightGets.set(url, sharedPromise);
    return raceWithSignal(sharedPromise, signal);
  }

  return performFetch(url, options);
}
