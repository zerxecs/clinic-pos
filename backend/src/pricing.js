const MAX_CENTS = 999_999_999_999n;
const roundRatio = (numerator, denominator) => {
  const rounded=(numerator + BigInt(denominator) / 2n) / BigInt(denominator);
  if(rounded>MAX_CENTS)throw new Error('Sale line exceeds the supported monetary limit.');
  return Number(rounded);
};

export function toCents(value) {
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Money values must have at most two decimal places.');
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function fromCents(cents) {
  const value = BigInt(cents);
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}

const mulQuantity = (cents, quantity) => roundRatio(BigInt(cents) * BigInt(quantity), 1000);
const percentOf = (cents, basisPoints) => roundRatio(BigInt(cents) * BigInt(basisPoints), 10000);

export function calculateSale({ items, configuration, discountType = null }) {
  if (!configuration || configuration.registration_type === 'UNCONFIGURED') {
    const error = new Error('An Admin must configure clinic tax settings before checkout.'); error.code = 'TAX_CONFIGURATION_REQUIRED'; throw error;
  }
  if (!['VAT_REGISTERED', 'NON_VAT', 'VAT_EXEMPT'].includes(configuration.registration_type)) throw new Error('Unsupported tax registration type.');
  if (discountType && !['SC', 'PWD'].includes(discountType)) throw new Error('Unsupported statutory discount type.');
  const rate = Number(configuration.vat_rate_basis_points);
  if (!Number.isInteger(rate) || rate < 0 || rate > 10000) throw new Error('Invalid configured VAT rate.');
  let subtotal = 0, discountTotal = 0, taxTotal = 0;
  const lines = items.map(item => {
    const quantity = Math.round(Number(item.quantity) * 1000);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || Math.abs(quantity / 1000 - Number(item.quantity)) > 1e-9) throw new Error('Quantity must use at most three decimal places.');
    const unitCents = Number(toCents(item.unit_price));
    const gross = mulQuantity(unitCents, quantity);
    const taxClass = item.tax_classification;
    if (!['VATABLE', 'VAT_EXEMPT', 'ZERO_RATED', 'NON_VAT'].includes(taxClass)) throw new Error('Product tax classification must be configured by an Admin.');
    if (configuration.registration_type === 'VAT_REGISTERED' && taxClass === 'NON_VAT') throw new Error('NON_VAT classification is not valid for a VAT-registered seller.');
    if (configuration.registration_type !== 'VAT_REGISTERED' && taxClass === 'VATABLE') throw new Error('VATABLE classification requires VAT registration.');
    if (taxClass === 'ZERO_RATED' && configuration.registration_type !== 'VAT_REGISTERED') throw new Error('ZERO_RATED classification requires VAT registration.');
    const vatEligible = configuration.registration_type === 'VAT_REGISTERED' && taxClass === 'VATABLE';
    const vatExempt = taxClass === 'VAT_EXEMPT';
    const base = vatEligible && configuration.pricing_mode === 'INCLUSIVE' ? roundRatio(BigInt(gross) * 10000n, 10000n + BigInt(rate)) : gross;
    const originalTax = vatEligible && configuration.pricing_mode === 'EXCLUSIVE' ? percentOf(base, rate) : (vatEligible ? gross - base : 0);
    const promoBps = Number(item.promotion_basis_points || 0);
    if (!Number.isInteger(promoBps) || promoBps < 0 || promoBps > 10000) throw new Error('Invalid product promotion configuration.');
    const promoGrossDiscount = percentOf(vatEligible && configuration.pricing_mode === 'INCLUSIVE' ? gross : base, promoBps);
    const promoGross = (vatEligible && configuration.pricing_mode === 'INCLUSIVE' ? gross : base) - promoGrossDiscount;
    const promoTaxable = vatEligible && configuration.pricing_mode === 'INCLUSIVE' ? roundRatio(BigInt(promoGross) * 10000n, 10000n + BigInt(rate)) : promoGross;
    const promoTax = vatEligible ? (configuration.pricing_mode === 'EXCLUSIVE' ? percentOf(promoTaxable, rate) : promoGross - promoTaxable) : 0;
    const promoDue = promoTaxable + promoTax;
    const promoDiscount = vatEligible && configuration.pricing_mode === 'INCLUSIVE' ? base - promoTaxable : promoGrossDiscount;
    const statutoryAllowed = discountType && item[discountType === 'SC' ? 'sc_discount_eligible' : 'pwd_discount_eligible'];
    const statutoryDiscount = statutoryAllowed ? percentOf(base, 2000) : 0;
    const statutoryTax = statutoryAllowed ? 0 : originalTax;
    const statutoryDue = base - statutoryDiscount + statutoryTax;
    const useStatutory = Boolean(statutoryAllowed && statutoryDue < promoDue);
    const discount = useStatutory ? statutoryDiscount : promoDiscount;
    const payableBase = useStatutory ? base - statutoryDiscount : promoTaxable;
    const tax = useStatutory ? statutoryTax : promoTax;
    const lineTotal = payableBase + tax;
    subtotal += base; discountTotal += discount; taxTotal += tax;
    if(subtotal>Number(MAX_CENTS)||discountTotal>Number(MAX_CENTS)||taxTotal>Number(MAX_CENTS))throw new Error('Sale exceeds the supported monetary limit.');
    return { gross: fromCents(gross), tax_classification: taxClass, quantity: item.quantity, unit_price: item.unit_price,
      discount_type: useStatutory ? discountType : (promoDiscount ? 'PROMOTION' : null), discount_amount: fromCents(discount),
      taxable_amount: fromCents(vatEligible ? payableBase : 0), vat_exempt_amount: fromCents(vatExempt || useStatutory ? payableBase : 0),
      zero_rated_amount: fromCents(taxClass === 'ZERO_RATED' ? payableBase : 0), tax_amount: fromCents(tax), line_total: fromCents(lineTotal) };
  });
  const total=lines.reduce((n,line)=>n+Number(toCents(line.line_total)),0);if(total>Number(MAX_CENTS))throw new Error('Sale exceeds the supported monetary limit.');
  const statutoryApplied=Boolean(discountType&&lines.some(line=>line.discount_type===discountType));
  const promotionApplied=lines.some(line=>line.discount_type==='PROMOTION');
  return { lines, subtotal: fromCents(subtotal), discount_total: fromCents(discountTotal), tax_total: fromCents(taxTotal), total: fromCents(total), discount_type:statutoryApplied?discountType:(promotionApplied?'PROMOTION':null), statutory_discount_type:statutoryApplied?discountType:null };
}
