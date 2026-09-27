import { z } from 'zod';
const id = z.string().uuid();

export const saleInputSchema = z.object({
  items: z.array(z.object({
    product_id: id,
    quantity: z.number().positive().max(100000),
  }).strict()).min(1).max(100),
  payments: z.array(z.object({
    method: z.enum(['CASH', 'CARD', 'E_WALLET', 'OTHER']),
    amount: z.number().positive().max(99999999).multipleOf(0.01),
    reference: z.string().max(200).optional(),
  }).strict()).min(1).max(10),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/),
  customer_name: z.string().max(200).optional(),
  discount: z.object({
    type: z.enum(['SC', 'PWD']),
    customer_name: z.string().trim().min(1).max(200),
    id_number: z.string().trim().min(1).max(100),
  }).strict().optional(),
}).strict();

export function parseSaleInput(value) {
  return saleInputSchema.parse(value);
}

function cents(value) {
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new Error('Money values must have at most two decimal places.');
  }

  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function assertPaymentTotal(payments, total) {
  const paidCents = payments.reduce((sum, payment) => sum + cents(payment.amount), 0n);
  const totalCents = cents(total);
  const cashOverpayment = payments.length === 1
    && payments[0].method === 'CASH'
    && paidCents >= totalCents;

  if (paidCents !== totalCents && !cashOverpayment) {
    const error = new Error('Payment amounts must equal sale total unless a single cash tender covers the total');
    error.statusCode = 400;
    error.code = 'PAYMENT_TOTAL_MISMATCH';
    throw error;
  }

  return {
    tenderedCents: paidCents,
    changeCents: cashOverpayment ? paidCents - totalCents : 0n,
    appliedCents: totalCents,
  };
}
