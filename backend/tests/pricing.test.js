import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSale } from '../src/pricing.js';

const vat = { registration_type:'VAT_REGISTERED', vat_rate_basis_points:1200, pricing_mode:'INCLUSIVE' };
const line = (overrides={}) => ({ unit_price:'112.00',quantity:1,tax_classification:'VATABLE',sc_discount_eligible:true,pwd_discount_eligible:true,promotion_basis_points:0,...overrides });

test('extracts VAT from an inclusive price without increasing the customer total',()=>{
  const result=calculateSale({items:[line()],configuration:vat});
  assert.deepEqual({subtotal:result.subtotal,tax:result.tax_total,total:result.total},{subtotal:'100.00',tax:'12.00',total:'112.00'});
});
test('adds configured VAT to an exclusive price',()=>{
  const result=calculateSale({items:[line({unit_price:'100.00'})],configuration:{...vat,pricing_mode:'EXCLUSIVE'}});
  assert.deepEqual({subtotal:result.subtotal,tax:result.tax_total,total:result.total},{subtotal:'100.00',tax:'12.00',total:'112.00'});
});
test('rounds tax to the nearest cent using the same deterministic rule',()=>{
  const result=calculateSale({items:[line({unit_price:'0.05'})],configuration:{...vat,pricing_mode:'EXCLUSIVE'}});
  assert.deepEqual({tax:result.tax_total,total:result.total},{tax:'0.01',total:'0.06'});
});
test('applies one SC statutory benefit and VAT exemption at line level',()=>{
  const result=calculateSale({items:[line()],configuration:vat,discountType:'SC'});
  assert.deepEqual({discount:result.discount_total,tax:result.tax_total,total:result.total,type:result.discount_type},{discount:'20.00',tax:'0.00',total:'80.00',type:'SC'});
  assert.equal(result.lines[0].vat_exempt_amount,'80.00');
});
test('PWD follows the same single-benefit calculation, with no SC and PWD stacking path',()=>{
  const result=calculateSale({items:[line()],configuration:vat,discountType:'PWD'});
  assert.deepEqual({discount:result.discount_total,total:result.total,type:result.discount_type},{discount:'20.00',total:'80.00',type:'PWD'});
});
test('chooses the more favorable of promotion or statutory benefit per eligible item',()=>{
  const result=calculateSale({items:[line({promotion_basis_points:3000}),line({unit_price:'10.00',sc_discount_eligible:false,pwd_discount_eligible:false,promotion_basis_points:1000})],configuration:vat,discountType:'SC'});
  assert.deepEqual(result.lines.map(item=>item.discount_type),['PROMOTION','PROMOTION']);
  assert.deepEqual(result.lines.map(item=>item.line_total),['78.40','9.00']);
});
test('mixed eligible and ineligible lines do not receive a statutory discount indiscriminately',()=>{
  const result=calculateSale({items:[line(),line({unit_price:'10.00',sc_discount_eligible:false,pwd_discount_eligible:false})],configuration:vat,discountType:'SC'});
  assert.deepEqual(result.lines.map(item=>item.line_total),['80.00','10.00']);
  assert.equal(result.discount_type,'SC');
});
test('does not report a statutory benefit when every line is ineligible',()=>{
  const result=calculateSale({items:[line({sc_discount_eligible:false,pwd_discount_eligible:false})],configuration:vat,discountType:'SC'});
  assert.equal(result.discount_total,'0.00');
  assert.equal(result.statutory_discount_type,null);
});
test('supports VAT-exempt and zero-rated line classifications',()=>{
  const result=calculateSale({items:[line({tax_classification:'VAT_EXEMPT'}),line({tax_classification:'ZERO_RATED'})],configuration:vat});
  assert.deepEqual({tax:result.tax_total,exempt:result.lines[0].vat_exempt_amount,zero:result.lines[1].zero_rated_amount,total:result.total},{tax:'0.00',exempt:'112.00',zero:'112.00',total:'224.00'});
});
test('refuses to calculate while the clinic tax status is unconfigured',()=>{
  assert.throws(()=>calculateSale({items:[line()],configuration:{registration_type:'UNCONFIGURED'}}),{code:'TAX_CONFIGURATION_REQUIRED'});
});
