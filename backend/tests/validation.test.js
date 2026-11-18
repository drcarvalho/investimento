const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeTicker,
  sanitizeSearchQuery,
  validateNotePayload,
} = require('../src/utils/validation');

test('normalizeTicker accepts valid B3 tickers and rejects invalid inputs', () => {
  assert.equal(normalizeTicker('petr4'), 'PETR4');
  assert.equal(normalizeTicker('  bpac11  '), 'BPAC11');
  assert.equal(normalizeTicker('MRSA5B'), 'MRSA5B');
  assert.equal(normalizeTicker('AB'), null);
  assert.equal(normalizeTicker('../etc'), null);
  assert.equal(normalizeTicker('PETR4;DROP TABLE'), null);
  assert.equal(normalizeTicker(''), null);
  assert.equal(normalizeTicker(null), null);
});

test('sanitizeSearchQuery strips control chars and caps length at 50', () => {
  assert.equal(sanitizeSearchQuery('  petr4\u0000\n '), 'petr4');
  assert.equal(sanitizeSearchQuery('A'.repeat(120)).length, 50);
  assert.equal(sanitizeSearchQuery(undefined), '');
});

test('validateNotePayload validates target price, checklist and length caps', () => {
  const valid = validateNotePayload({
    thesis: 'Boa geracao de caixa',
    risks: 'Ciclo de commodities',
    target_price: 42.556,
    checklist: [
      { text: 'Li o RI', done: true },
      { text: '   ', done: false },
    ],
  });
  assert.equal(valid.error, undefined);
  assert.equal(valid.data.target_price, 42.56);
  assert.equal(valid.data.checklist.length, 1);
  assert.deepEqual(valid.data.checklist[0], { text: 'Li o RI', done: true });

  const negativeTarget = validateNotePayload({ target_price: -10 });
  assert.ok(negativeTarget.error);

  const hugeTarget = validateNotePayload({ target_price: 99999999 });
  assert.ok(hugeTarget.error);

  const capped = validateNotePayload({
    thesis: 'X'.repeat(6000),
    checklist: Array.from({ length: 80 }, (_, i) => ({ text: `Item ${i}`, done: false })),
  });
  assert.equal(capped.data.thesis.length, 5000);
  assert.equal(capped.data.checklist.length, 50);
});

