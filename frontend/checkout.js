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
  if (!payments.length || payments.some(payment => !Number.isFinite(payment.amount) || payment.amount <= 0)) {
    throw new Error('Enter a payment amount greater than zero for each tender.');
  }
  const paidCents = payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
  const totalCents = Math.round(total * 100);
  if (paidCents !== totalCents) {
    throw new Error('Tender amounts must equal the total due. Adjust the amounts to continue.');
  }
}

export function beginCheckout(state) {
  if (state.checkoutBusy) return false;
  state.checkoutBusy = true;
  return true;
}

export function endCheckout(state) {
  state.checkoutBusy = false;
}
