import test from 'node:test';
import assert from 'node:assert/strict';
import { safeHttpUrl, sanitizeTicker, escapeCsvCell } from '../src/utils/security.js';

test('safeHttpUrl allows http/https and blocks javascript/data schemes', () => {
  assert.equal(safeHttpUrl('https://petrobras.com.br'), 'https://petrobras.com.br/');
  assert.equal(safeHttpUrl('http://example.com/ri'), 'http://example.com/ri');
  assert.equal(safeHttpUrl('http://example.com/ri', { httpsOnly: true }), null);
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(safeHttpUrl('vbscript:msgbox(1)'), null);
  assert.equal(safeHttpUrl('not-a-url'), null);
});

test('sanitizeTicker enforces B3 ticker allowlist', () => {
  assert.equal(sanitizeTicker('petr4'), 'PETR4');
  assert.equal(sanitizeTicker(' itub4 '), 'ITUB4');
  assert.equal(sanitizeTicker('bpac11'), 'BPAC11');
  assert.equal(sanitizeTicker('AB'), null);
  assert.equal(sanitizeTicker('SCRIPT12345'), null);
});

test('escapeCsvCell neutralizes CSV Formula Injection and quotes delimiters', () => {
  assert.equal(escapeCsvCell('=CMD|"/C calc"!A0'), `"'=CMD|""/C calc""!A0"`);
  assert.equal(escapeCsvCell('+SUM(A1:A2)'), "'+SUM(A1:A2)");
  assert.equal(escapeCsvCell('-1+1'), "'-1+1");
  assert.equal(escapeCsvCell('@evil'), "'@evil");
  assert.equal(escapeCsvCell('Banco; S.A.'), '"Banco; S.A."');
  assert.equal(escapeCsvCell('Petrobras'), 'Petrobras');
});

