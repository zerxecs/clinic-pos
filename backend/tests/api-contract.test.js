import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseSaleInput, assertPaymentTotal } from '../src/sales-input.js';
import { shapeProductRows } from '../src/product-response.js';
const serverPath=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../src/server.js');
const server=await readFile(serverPath,'utf8');
const migration=await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../migrations/003_sale_integrity_privacy.sql'),'utf8');
const invoiceMigration=await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../migrations/004_invoice_authorization_fields.sql'),'utf8');
const valid={items:[{product_id:'00000000-0000-4000-8000-000000000001',quantity:1}],payments:[{method:'CASH',amount:12.5}],currency:'PHP'};
test('invalid and client-declared failed payment payloads are rejected by strict validation',()=>{
 assert.throws(()=>parseSaleInput({...valid,payments:[{method:'CASH',amount:12.5,status:'FAILED'}]}),{name:'ZodError'});
 assert.throws(()=>parseSaleInput({...valid,payments:[{method:'DECLINED',amount:12.5}]}),{name:'ZodError'});
 assert.throws(()=>parseSaleInput({...valid,payments:[{method:'CASH',amount:12.501}]}),{name:'ZodError'});
 assert.throws(()=>parseSaleInput({...valid,discount:{type:'SC',percentage:100,customer_name:'Client',id_number:'X'}}),{name:'ZodError'});
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
test('report and movement endpoints are registered',()=>{
 assert.match(server,/app\.get\('\/api\/v1\/inventory\/movements'/);
 assert.match(server,/app\.get\('\/api\/v1\/reports\/sales'/);
 assert.match(server,/app\.get\('\/api\/v1\/reports\/stock'/);
});
test('product response limits lot details to Admin while preserving cashier totals and expiry warnings',()=>{
 assert.match(server,/const isAdmin=req\.user\.roles\.includes\('ADMIN'\);/);
 assert.match(server,/shapeProductRows\(rows,isAdmin\)/);
 assert.match(server,/CASE WHEN p\.item_type='SERVICE' THEN 100000 ELSE COALESCE\(sum\(l\.qty_on_hand\) FILTER\(WHERE l\.is_active AND \(l\.expires_on IS NULL OR l\.expires_on>=current_date\)\),0\) END qty_sellable/);
 const sample={id:'p-1',sku:'SKU-1',barcode:'123',name:'Medicine',description:null,unit:'each',item_type:'PRODUCT',is_active:true,price:'12.50',currency:'PHP',qty_on_hand:'8',qty_sellable:'5',qty_expiring_soon:'2',lots:[{lot_id:'lot-secret',lot_code:'BATCH-SECRET',expires_on:'2026-10-01',qty_on_hand:'2',is_active:true,is_sellable:true}]};
 const [cashier]=shapeProductRows([sample],false);
 assert.deepEqual(cashier,{id:'p-1',sku:'SKU-1',barcode:'123',name:'Medicine',description:null,unit:'each',item_type:'PRODUCT',price:'12.50',currency:'PHP',qty_sellable:'5',expiry_warning:true});
 for(const key of ['qty_on_hand','lots','is_active','qty_expiring_soon']) assert.equal(Object.hasOwn(cashier,key),false,`cashier must not receive ${key}`);
 const [admin]=shapeProductRows([sample],true);
 assert.equal(admin.lots[0].lot_id,'lot-secret');
 assert.equal(admin.lots[0].lot_code,'BATCH-SECRET');
 assert.equal(admin.lots[0].expires_on,'2026-10-01');
 assert.equal(admin.qty_on_hand,'8');
});
test('cashier sales list is scoped in SQL while Admin may see all',()=>{
 const line=server.split(/\r?\n/).find(x=>x.startsWith("app.get('/api/v1/sales',"));
 assert.match(line,/\$1::boolean OR cashier_user_id=\$2/);
 assert.match(line,/req\.user\.roles\.includes\('ADMIN'\)/);
});
test('tax configuration mutation is Admin-only, product rules are backend validated, and sales have server quote pricing',()=>{
 assert.match(server,/app\.put\('\/api\/v1\/tax-configuration', only\('ADMIN'\)/);
 assert.match(server,/app\.post\('\/api\/v1\/sales\/quote', only\('ADMIN','CASHIER'\)/);
 assert.match(server,/canonicalJson\(v\)/);
 assert.match(server,/INVALID_PRICING_CONFIGURATION/);
 assert.match(server,/statutory_discount_type/);
});

test('tax migration backfills deterministic historical line numbers and constrains values',()=>{
 assert.match(migration,/row_number\(\) OVER \(PARTITION BY sale_id ORDER BY id\)/);
 assert.match(migration,/UNIQUE \(sale_id, line_no\)/);
 assert.match(migration,/tax_classification IN \('UNCLASSIFIED','VATABLE','VAT_EXEMPT','ZERO_RATED','NON_VAT'\)/);
 assert.match(migration,/Existing empty tax snapshots remain explicitly unknown/);
 assert.match(migration,/status IN \('PENDING','COMPLETED','VOIDED'\)/);
 assert.match(migration,/BEFORE INSERT OR UPDATE OR DELETE ON sale_item/);
});

test('beneficiary identity is absent from normal sale responses and invoice reads are separate and audited',()=>{
 assert.match(server,/statutory_customer:s\.statutory_discount_type\?\{type:s\.statutory_discount_type\}:null/);
 assert.match(server,/app\.get\('\/api\/v1\/sales\/:id\/invoice', only\('ADMIN','CASHIER'\)/);
 assert.match(server,/SALE_INVOICE_BENEFICIARY_VIEWED/);
 assert.match(server,/INSERT INTO sale_beneficiary\(sale_id,benefit_type,customer_name,id_number\)/);
 const saleList=server.split(/\r?\n/).find(x=>x.startsWith("app.get('/api/v1/sales',"));
 assert.doesNotMatch(saleList,/statutory|beneficiar/i);
});

test('invoice authorization fields are configurable and never seeded with fake seller values',()=>{
 for(const field of ['permit_to_use_number','permit_to_use_date','authority_to_print_number','authority_to_print_date','approved_serial_numbers']) assert.match(invoiceMigration,new RegExp(`ADD COLUMN ${field}`));
 assert.match(server,/permit_to_use_number:z\.string\(\)\.trim\(\)\.max\(100\)/);
 assert.match(server,/approved_serial_numbers:z\.string\(\)\.trim\(\)\.max\(500\)/);
 assert.doesNotMatch(invoiceMigration,/INSERT INTO|UPDATE tax_configuration/);
});
