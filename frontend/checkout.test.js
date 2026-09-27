import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCartQuantity, assertTenderTotal, beginCheckout, endCheckout, isSellableProduct, cashChangePreview } from './checkout.js';

test('checkout allows available quantities and split tenders that exactly pay the total', () => {
  assert.equal(assertCartQuantity(2, 3), 2);
  assert.doesNotThrow(() => assertTenderTotal([{ amount: 10 }, { amount: 2.5 }], 12.5));
});

test('checkout rejects invalid, excess, and unavailable product quantities', () => {
  assert.throws(() => assertCartQuantity(0, 3), /at least one/);
  assert.throws(() => assertCartQuantity(1.5, 3), /at least one/);
  assert.throws(() => assertCartQuantity(4, 3), /Only 3 available/);
  assert.equal(isSellableProduct({ qty_sellable: 0 }), false);
  assert.equal(isSellableProduct({ qty_sellable: '2' }), true);
  assert.equal(isSellableProduct({ item_type: 'SERVICE', qty_sellable: 0 }), true);
});

test('checkout rejects empty, invalid, or mismatched tender amounts', () => {
  assert.throws(() => assertTenderTotal([], 10), /greater than zero/);
  assert.throws(() => assertTenderTotal([{ amount: 0 }], 10), /greater than zero/);
  assert.throws(() => assertTenderTotal([{ amount: 9.99 }], 10), /equal the total/);
});

test('cash permits exact and overpayment with integer-cent change, while other methods remain exact', () => {
  assert.equal(assertTenderTotal([{ method:'CASH', amount:5 }], 5).changeCents, 0);
  assert.equal(assertTenderTotal([{ method:'CASH', amount:6 }], 5).changeCents, 100);
  assert.throws(() => assertTenderTotal([{ method:'CASH', amount:4.99 }], 5), /cover the total/);
  assert.throws(() => assertTenderTotal([{ method:'CARD', amount:6 }], 5), /equal the total/);
  assert.deepEqual(cashChangePreview('6.00', '5.00'), { sufficient:true, changeCents:100 });
  assert.deepEqual(cashChangePreview('4.99', '5.00'), { sufficient:false, changeCents:0 });
});

test('checkout accepts only one submission at a time', () => {
  const state = { checkoutBusy: false };
  assert.equal(beginCheckout(state), true);
  assert.equal(beginCheckout(state), false);
  endCheckout(state);
  assert.equal(beginCheckout(state), true);
});
