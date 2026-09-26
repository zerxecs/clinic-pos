import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseSaleInput, assertPaymentTotal } from '../src/sales-input.js';
const serverPath=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../src/server.js');
const server=await readFile(serverPath,'utf8');
const valid={items:[{product_id:'00000000-0000-4000-8000-000000000001',quantity:1}],payments:[{method:'CASH',amount:12.5}],currency:'PHP'};
test('invalid and client-declared failed payment payloads are rejected by strict validation',()=>{
 assert.throws(()=>parseSaleInput({...valid,payments:[{method:'CASH',amount:12.5,status:'FAILED'}]}),{name:'ZodError'});
 assert.throws(()=>parseSaleInput({...valid,payments:[{method:'DECLINED',amount:12.5}]}),{name:'ZodError'});
 assert.throws(()=>parseSaleInput({...valid,payments:[{method:'CASH',amount:12.501}]}),{name:'ZodError'});
});
test('mixed tender totals are checked in integer cents and mismatches fail',()=>{
 const sale=parseSaleInput({...valid,payments:[{method:'CASH',amount:5},{method:'CARD',amount:7.5}]});
 assert.doesNotThrow(()=>assertPaymentTotal(sale.payments,12.5));
 assert.throws(()=>assertPaymentTotal(sale.payments,13),{code:'PAYMENT_TOTAL_MISMATCH',statusCode:400});
});
test('sale input validation runs before transaction and payment totals before all writes',()=>{
 const validated=server.indexOf('const v=parseSaleInput(req.body);');
 const transaction=server.indexOf("return tx(async db=>{await db.query('SELECT pg_advisory_xact_lock",validated);
 const total=server.indexOf('assertPaymentTotal(v.payments,total);',transaction);
 const saleInsert=server.indexOf("INSERT INTO sale(receipt_number",transaction);
 const stockUpdate=server.indexOf('UPDATE inventory_lot SET qty_on_hand=qty_on_hand-$2',transaction);
 const paymentInsert=server.indexOf('INSERT INTO payment(sale_id',transaction);
 assert.ok(validated>=0&&transaction>validated,'request validation must precede transaction entry');
 assert.ok(total<saleInsert&&total<stockUpdate&&total<paymentInsert,'payment totals must validate before sale, stock, and payment writes');
});
test('missing report and movement endpoints and per-lot product expiry are registered',()=>{
 assert.match(server,/app\.get\('\/api\/v1\/inventory\/movements'/);
 assert.match(server,/app\.get\('\/api\/v1\/reports\/sales'/);
 assert.match(server,/app\.get\('\/api\/v1\/reports\/stock'/);
 assert.match(server,/jsonb_agg\(jsonb_build_object\('lot_id',l\.id,'lot_code',l\.lot_code,'expires_on',l\.expires_on/);
});
test('cashier sales list is scoped in SQL while Admin may see all',()=>{
 const line=server.split(/\r?\n/).find(x=>x.startsWith("app.get('/api/v1/sales',"));
 assert.match(line,/\$1::boolean OR cashier_user_id=\$2/);
 assert.match(line,/req\.user\.roles\.includes\('ADMIN'\)/);
});
