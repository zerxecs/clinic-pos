import test from 'node:test';
import assert from 'node:assert/strict';
import { barcodeFromKeyboardEvent, isWithinExpiryWarning } from './pos-ux.js';

test('expiry warning uses local calendar days at different times of today and tomorrow', () => {
  const today = new Date(2026, 8, 27, 0, 1);
  const todayLate = new Date(2026, 8, 27, 23, 59);
  const tomorrowEarly = new Date(2026, 8, 28, 0, 1);
  const tomorrowLate = new Date(2026, 8, 28, 23, 59);
  for (const now of [today, todayLate, tomorrowEarly, tomorrowLate]) {
    assert.equal(isWithinExpiryWarning('2026-09-27', now), true);
    assert.equal(isWithinExpiryWarning('2026-09-28', now), true);
  }
  assert.equal(isWithinExpiryWarning('2026-10-28', today), false);
});

test('scanner Enter selects the exact barcode match and ignores other keys', () => {
  const products = [
    { id: 'p1', barcode: '0123456789012' },
    { id: 'p2', barcode: '9876543210987' }
  ];
  assert.equal(barcodeFromKeyboardEvent({ key: 'Enter' }, products, '0123456789012').id, 'p1');
  assert.equal(barcodeFromKeyboardEvent({ key: 'Enter' }, products, 'not-a-barcode'), undefined);
  assert.equal(barcodeFromKeyboardEvent({ key: 'Tab' }, products, '0123456789012'), undefined);
});
