const TICKER_REGEX = /^[A-Z0-9]{4,7}$/;

// Allow only http(s) URLs to block javascript:, data:, vbscript: XSS vectors
export function safeHttpUrl(raw, { httpsOnly = false } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = new URL(raw.trim());
    if (httpsOnly) {
      return parsed.protocol === 'https:' ? parsed.href : null;
    }
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function sanitizeTicker(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
  return TICKER_REGEX.test(cleaned) ? cleaned : null;
}

// Neutralize CSV Formula Injection (DDE / Excel) and escape delimiters/quotes
export function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[;"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

