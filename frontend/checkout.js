export function isSellableProduct(product) {
  return product?.item_type === 'SERVICE' || Number(product?.qty_sellable) > 0;
}

export function assertCartQuantity(quantity, available) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error('Enter a quantity of at least one.');
  }
  if (quantity > Number(available)) {
    throw new Error(`Only ${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(Number(available) || 0)} available.`);
  }
  return quantity;
}

export function assertTenderTotal(payments, total) {
  if (!payments.length || payments.some(payment => (
    !Number.isFinite(payment.amount) || payment.amount <= 0
  ))) {
    throw new Error('Enter a payment amount greater than zero for each tender.');
  }
  const paidCents = payments.reduce((sum, payment) => sum + decimalCents(payment.amount), 0);
  const totalCents = decimalCents(total);
  const singleCashOverpayment = payments.length === 1
    && payments[0].method === 'CASH'
    && paidCents >= totalCents;
  if (paidCents !== totalCents && !singleCashOverpayment) {
    throw new Error('Cash received must cover the total due. Other tender amounts must equal the total.');
  }
  return { tenderedCents: paidCents, changeCents: singleCashOverpayment ? paidCents - totalCents : 0 };
}

function decimalCents(value) {
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return NaN;
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function cashChangePreview(tendered, total) {
  const tenderedCents = decimalCents(tendered);
  const totalCents = decimalCents(total);
  if (!Number.isSafeInteger(tenderedCents)
    || !Number.isSafeInteger(totalCents)
    || tenderedCents < 0) {
    return { sufficient: false, changeCents: 0 };
  }

  return {
    sufficient: tenderedCents >= totalCents,
    changeCents: Math.max(0, tenderedCents - totalCents),
  };
}

export function beginCheckout(state) {
  if (state.checkoutBusy) return false;
  state.checkoutBusy = true;
  return true;
}

export function endCheckout(state) {
  state.checkoutBusy = false;
}
