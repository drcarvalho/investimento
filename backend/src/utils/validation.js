const TICKER_REGEX = /^[A-Z0-9]{4,7}$/;

function normalizeTicker(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.toUpperCase().trim();
  return TICKER_REGEX.test(cleaned) ? cleaned : null;
}

function sanitizeSearchQuery(raw) {
  if (typeof raw !== 'string') return '';
  // Remove control characters and cap length
  return raw.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 50);
}

function validateNotePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Payload inválido' };
  }

  const thesis = typeof body.thesis === 'string' ? body.thesis.slice(0, 5000) : '';
  const risks = typeof body.risks === 'string' ? body.risks.slice(0, 5000) : '';

  let targetPrice = null;
  if (body.target_price !== null && body.target_price !== undefined && body.target_price !== '') {
    const n = Number(body.target_price);
    if (!Number.isFinite(n) || n < 0 || n > 1000000) {
      return { error: 'Preço-alvo inválido (deve ser entre 0 e 1.000.000)' };
    }
    targetPrice = Number(n.toFixed(2));
  }

  let checklist = [];
  if (Array.isArray(body.checklist)) {
    checklist = body.checklist
      .slice(0, 50)
      .filter((item) => item && typeof item.text === 'string' && item.text.trim().length > 0)
      .map((item) => ({
        text: item.text.trim().slice(0, 240),
        done: Boolean(item.done),
      }));
  }

  return {
    data: {
      thesis,
      risks,
      target_price: targetPrice,
      checklist,
    },
  };
}

module.exports = {
  TICKER_REGEX,
  normalizeTicker,
  sanitizeSearchQuery,
  validateNotePayload,
};

