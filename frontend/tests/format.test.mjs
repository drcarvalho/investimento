import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtNum, fmtMoney, fmtVol, fmtMacroVal, formatDateBr } from '../src/utils/format.js';

test('fmtNum formats decimals with pt-BR comma and handles null/NaN', () => {
  assert.equal(fmtNum(12.345), '12,35');
  assert.equal(fmtNum(8.5, 1, '%'), '8,5%');
  assert.equal(fmtNum(null), '—');
  assert.equal(fmtNum(undefined), '—');
  assert.equal(fmtNum(NaN), '—');
});

test('fmtMoney formats trillions, billions, millions and regular BRL values', () => {
  assert.equal(fmtMoney(1.5e12), 'R$ 1,50 T');
  assert.equal(fmtMoney(2.35e9), 'R$ 2,35 B');
  assert.equal(fmtMoney(-4.2e6), 'R$ -4,20 M');
  assert.equal(fmtMoney(null), '—');
});

test('fmtVol abbreviates millions and thousands cleanly', () => {
  assert.equal(fmtVol(15_400_000), '15,40 M');
  assert.equal(fmtVol(12_500), '12,5 K');
  assert.equal(fmtVol(0), '—');
  assert.equal(fmtVol(null), '—');
});

test('fmtMacroVal and formatDateBr format BCB indicators and ISO dates', () => {
  assert.equal(fmtMacroVal({ value: 5.7812, unit: 'R$' }), 'R$ 5,7812');
  assert.equal(fmtMacroVal({ value: 13.75, unit: '% a.a.' }), '13,75% a.a.');
  assert.equal(fmtMacroVal(null), '—');
  assert.equal(formatDateBr('2026-11-17'), '17/11/2026');
  assert.equal(formatDateBr(''), '');
});

