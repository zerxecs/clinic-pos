import { z } from 'zod';
const id=z.string().uuid();
export const saleInputSchema=z.object({items:z.array(z.object({product_id:id,quantity:z.number().positive().max(100000)}).strict()).min(1).max(100),payments:z.array(z.object({method:z.enum(['CASH','CARD','E_WALLET','OTHER']),amount:z.number().positive().max(99999999).multipleOf(0.01),reference:z.string().max(200).optional()}).strict()).min(1).max(10),currency:z.string().length(3).regex(/^[A-Z]{3}$/),customer_name:z.string().max(200).optional()});
export function parseSaleInput(value){return saleInputSchema.parse(value);}
export function assertPaymentTotal(payments,total){const paidCents=payments.reduce((sum,p)=>sum+Math.round(p.amount*100),0);const totalCents=Math.round(total*100);if(paidCents!==totalCents){const error=new Error('Payment amounts must equal sale total');error.statusCode=400;error.code='PAYMENT_TOTAL_MISMATCH';throw error;}}
