import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

// This suite intentionally ignores DATABASE_URL and dotenv. It only operates on
// the explicitly supplied, unmistakably disposable TEST_DATABASE_URL.
const testUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(testUrl);
const required = enabled ? false : 'Set TEST_DATABASE_URL to a disposable clinic_pos_test database.';
let pool;
let server;
let baseUrl;
let adminToken;
let cashierToken;
let adminId;
let cashierId;
let password;
const productIds = [];
const saleIds = [];
const request = async (path, { token = cashierToken, method = 'GET', body, headers = {} } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
};

async function createProduct(stockLots, options={}) {
  const product = await request('/api/v1/products', { token: adminToken, method: 'POST', body: { sku: `IT-${randomUUID()}`, name: options.name??'Integration fixture', unit: 'each', item_type:options.item_type??'PRODUCT', price: options.price??10, currency: 'PHP', tax_classification:options.tax_classification??'NON_VAT',sc_discount_eligible:Boolean(options.sc_discount_eligible),pwd_discount_eligible:Boolean(options.pwd_discount_eligible) } });
  assert.equal(product.status, 200);
  productIds.push(product.body.id);
  const lotIds = [];
  for (const lot of stockLots) {
    const received = await request('/api/v1/inventory/receipts', { token: adminToken, method: 'POST', body: { product_id: product.body.id, lot_code: `LOT-${randomUUID()}`, expires_on: lot.expires_on, unit_cost: 1, quantity: lot.quantity } });
    assert.equal(received.status, 200);
    lotIds.push(received.body.id);
  }
  return { productId: product.body.id, lotIds };
}

async function sell(productId, quantity, key) {
  return request('/api/v1/sales', { method: 'POST', headers: { 'idempotency-key': key }, body: { items: [{ product_id: productId, quantity }], payments: [{ method: 'CASH', amount: quantity * 10 }], currency: 'PHP' } });
}

describe('isolated PostgreSQL sales and inventory transaction behavior', { skip: required }, () => {
  before(async () => {
    const parsed = new URL(testUrl);
    if (!/^clinic_pos_test(?:_[a-z0-9]+)?$/i.test(decodeURIComponent(parsed.pathname.slice(1)))) throw new Error('Refusing test database: its database name must match clinic_pos_test or clinic_pos_test_<suffix>.');
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== '::1') throw new Error('Refusing test database: use a local disposable PostgreSQL instance.');
    const env = { ...process.env, DATABASE_URL: testUrl };
    delete env.DATABASE_SSL;
    const migration = spawnSync(process.execPath, ['src/migrate.js'], { cwd: new URL('..', import.meta.url), env, encoding: 'utf8' });
    if (migration.status !== 0) throw new Error(`Test database migrations failed: ${migration.stderr || migration.stdout}`);
    pool = new pg.Pool({ connectionString: testUrl });
    const { rows } = await pool.query('SELECT current_database() AS name');
    if (!/^clinic_pos_test(?:_[a-z0-9]+)?$/i.test(rows[0].name)) throw new Error('Refusing unexpected database name.');
    const roleRows = await pool.query("SELECT code FROM role WHERE code IN ('ADMIN','CASHIER')");
    assert.equal(roleRows.rowCount, 2, 'migrations must seed Admin and Cashier roles');
    const adminPass = randomUUID() + randomUUID();
    password = adminPass;
    adminId = (await pool.query('INSERT INTO app_user(username,password_hash,display_name) VALUES($1,$2,$3) RETURNING id', [`it-admin-${randomUUID()}`, await argon2.hash(adminPass), 'Integration Admin'])).rows[0].id;
    cashierId = (await pool.query('INSERT INTO app_user(username,password_hash,display_name) VALUES($1,$2,$3) RETURNING id', [`it-cashier-${randomUUID()}`, await argon2.hash(adminPass), 'Integration Cashier'])).rows[0].id;
    for (const [userId, role] of [[adminId, 'ADMIN'], [cashierId, 'CASHIER']]) await pool.query('INSERT INTO user_role(user_id,role_id) SELECT $1,id FROM role WHERE code=$2', [userId, role]);
    const secret = randomUUID() + randomUUID();
    const port = 31000 + Math.floor(Math.random() * 20000);
    baseUrl = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['src/server.js'], { cwd: new URL('..', import.meta.url), env: { ...env, PORT: String(port), HOST: '127.0.0.1', ACCESS_TOKEN_SECRET: secret }, stdio: 'ignore' });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error('API server exited before becoming ready.');
      try { if ((await fetch(`${baseUrl}/health`)).ok) break; } catch {}
      if (attempt === 99) throw new Error('API server did not become ready.');
      await delay(50);
    }
    const login = async username => {
      const result = await request('/api/v1/auth/login', { token: undefined, method: 'POST', body: { username, password: adminPass } });
      assert.equal(result.status, 200);
      return result.body.access_token;
    };
    adminToken = await login((await pool.query('SELECT username FROM app_user WHERE id=$1', [adminId])).rows[0].username);
    cashierToken = await login((await pool.query('SELECT username FROM app_user WHERE id=$1', [cashierId])).rows[0].username);
    const config=await request('/api/v1/tax-configuration',{token:adminToken,method:'PUT',body:{registration_type:'NON_VAT',vat_rate_basis_points:0,pricing_mode:'INCLUSIVE',registered_name:'Test Clinic',tin:'TEST-TIN',registered_address:'Local test database',effective_from:new Date().toISOString().slice(0,10)}});
    assert.equal(config.status,200);
  });

  after(async () => {
    if (server && server.exitCode === null) { server.kill(); await new Promise(resolve => server.once('exit', resolve)); }
    if (!pool) return;
    await pool.query("DELETE FROM audit_log WHERE actor_user_id = ANY($1::uuid[])", [[adminId, cashierId].filter(Boolean)]);
    await pool.query("DELETE FROM stock_movement WHERE actor_user_id = ANY($1::uuid[])", [[adminId, cashierId].filter(Boolean)]);
    await pool.query('DELETE FROM idempotency_record WHERE cashier_user_id=$1', [cashierId]);
    await pool.query('DELETE FROM refresh_session WHERE user_id = ANY($1::uuid[])', [[adminId, cashierId].filter(Boolean)]);
    if (saleIds.length) {
      await pool.query('DELETE FROM payment WHERE sale_id=ANY($1::uuid[])', [saleIds]);
      await pool.query('DELETE FROM sale_item_lot WHERE sale_item_id IN (SELECT id FROM sale_item WHERE sale_id=ANY($1::uuid[]))', [saleIds]);
      await pool.query('DELETE FROM sale_item WHERE sale_id=ANY($1::uuid[])', [saleIds]);
      await pool.query('DELETE FROM sale WHERE id=ANY($1::uuid[])', [saleIds]);
    }
    if (productIds.length) {
      await pool.query('DELETE FROM inventory_lot WHERE product_id=ANY($1::uuid[])', [productIds]);
      await pool.query('DELETE FROM product_price WHERE product_id=ANY($1::uuid[])', [productIds]);
      await pool.query('DELETE FROM product WHERE id=ANY($1::uuid[])', [productIds]);
    }
    await pool.query('UPDATE tax_configuration SET updated_by=NULL WHERE updated_by=ANY($1::uuid[])', [[adminId, cashierId].filter(Boolean)]);
    await pool.query('DELETE FROM user_role WHERE user_id=ANY($1::uuid[])', [[adminId, cashierId].filter(Boolean)]);
    await pool.query('DELETE FROM app_user WHERE id=ANY($1::uuid[])', [[adminId, cashierId].filter(Boolean)]);
    await pool.end();
  });

  test('rejects cashier access to Admin-only inventory operations', async () => {
    const result = await request('/api/v1/inventory/lots');
    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'FORBIDDEN');
  });
  test('Cashier cannot update Admin tax configuration',async()=>{
    const result=await request('/api/v1/tax-configuration',{token:cashierToken,method:'PUT',body:{registration_type:'NON_VAT',vat_rate_basis_points:0,pricing_mode:'INCLUSIVE',registered_name:'Test Clinic',tin:'TEST-TIN',registered_address:'Test',effective_from:new Date().toISOString().slice(0,10)}});
    assert.equal(result.status,403);
  });
  test('stores the original inclusive VAT and statutory discount values on the invoice',async()=>{
    try{
      const changed=await request('/api/v1/tax-configuration',{token:adminToken,method:'PUT',body:{registration_type:'VAT_REGISTERED',vat_rate_basis_points:1200,pricing_mode:'INCLUSIVE',registered_name:'Test VAT Clinic',tin:'TEST-TIN',registered_address:'Local test database',effective_from:new Date().toISOString().slice(0,10)}});
      assert.equal(changed.status,200);
      const {productId}=await createProduct([{expires_on:'2099-01-01',quantity:2}],{price:112,tax_classification:'VATABLE',sc_discount_eligible:true,pwd_discount_eligible:true});
      const sale=await request('/api/v1/sales',{method:'POST',headers:{'idempotency-key':`sc-${randomUUID()}`},body:{items:[{product_id:productId,quantity:1}],payments:[{method:'CASH',amount:80}],currency:'PHP',discount:{type:'SC',customer_name:'Test Senior',id_number:'TEST-ID-1'}}});
      assert.equal(sale.status,200);saleIds.push(sale.body.id);
      assert.equal(sale.body.subtotal,'100.00');assert.equal(sale.body.tax_total,'0.00');assert.equal(sale.body.discount_total,'20.00');assert.equal(sale.body.total,'80.00');
      assert.equal(sale.body.invoice_number,sale.body.receipt_number);assert.equal(sale.body.tax_snapshot.vat_rate_basis_points,1200);assert.equal(sale.body.statutory_customer.id_number,'TEST-ID-1');
    }finally{await request('/api/v1/tax-configuration',{token:adminToken,method:'PUT',body:{registration_type:'NON_VAT',vat_rate_basis_points:0,pricing_mode:'INCLUSIVE',registered_name:'Test Clinic',tin:'TEST-TIN',registered_address:'Local test database',effective_from:new Date().toISOString().slice(0,10)}});}
  });

  test('uses FEFO and excludes expired stock', async () => {
    const { productId, lotIds } = await createProduct([
      { expires_on: '2020-01-01', quantity: 4 },
      { expires_on: '2099-01-01', quantity: 3 },
      { expires_on: '2099-02-01', quantity: 5 },
    ]);
    const result = await sell(productId, 4, `fefo-${randomUUID()}`);
    assert.equal(result.status, 200);
    saleIds.push(result.body.id);
    const allocations = (await pool.query('SELECT sil.lot_id,sil.quantity FROM sale_item_lot sil JOIN inventory_lot l ON l.id=sil.lot_id WHERE sil.sale_item_id IN (SELECT id FROM sale_item WHERE sale_id=$1) ORDER BY l.expires_on,l.received_at,l.id', [result.body.id])).rows;
    assert.deepEqual(allocations, [{ lot_id: lotIds[1], quantity: '3.000' }, { lot_id: lotIds[2], quantity: '1.000' }]);
    const stocks = (await pool.query('SELECT id,qty_on_hand FROM inventory_lot WHERE id=ANY($1::uuid[]) ORDER BY id', [lotIds])).rows;
    assert.equal(stocks.find(row => row.id === lotIds[0]).qty_on_hand, '4.000');
  });
  test('allows service sales without stock lots or inventory movements',async()=>{
    const service=await createProduct([],{name:'Clinic service',item_type:'SERVICE'});
    const result=await sell(service.productId,1,`service-${randomUUID()}`);
    assert.equal(result.status,200);saleIds.push(result.body.id);
    assert.equal((await pool.query('SELECT count(*)::int n FROM stock_movement WHERE product_id=$1',[service.productId])).rows[0].n,0);
    assert.equal((await pool.query('SELECT count(*)::int n FROM sale_item_lot sil JOIN sale_item si ON si.id=sil.sale_item_id WHERE si.sale_id=$1',[result.body.id])).rows[0].n,0);
  });

  test('concurrent checkouts lock shared products in a stable order',async()=>{
    const first=await createProduct([{expires_on:'2099-01-01',quantity:2}],{name:'First ordered product'});
    const second=await createProduct([{expires_on:'2099-01-01',quantity:2}],{name:'Second ordered product'});
    const checkout=(products,key)=>request('/api/v1/sales',{method:'POST',headers:{'idempotency-key':key},body:{items:products.map(product_id=>({product_id,quantity:1})),payments:[{method:'CASH',amount:20}],currency:'PHP'}});
    const results=await Promise.all([checkout([first.productId,second.productId],`order-a-${randomUUID()}`),checkout([second.productId,first.productId],`order-b-${randomUUID()}`)]);
    assert.deepEqual(results.map(result=>result.status),[200,200]);saleIds.push(...results.map(result=>result.body.id));
    assert.deepEqual(results[0].body.items.map(item=>item.name),['First ordered product','Second ordered product']);
    assert.deepEqual(results[1].body.items.map(item=>item.name),['Second ordered product','First ordered product']);
  });

  test('insufficient stock rolls back sale, payment, movements, and stock changes', async () => {
    const { productId, lotIds } = await createProduct([{ expires_on: '2099-01-01', quantity: 1 }]);
    const movementCount = (await pool.query('SELECT count(*)::int n FROM stock_movement WHERE lot_id=ANY($1::uuid[])', [lotIds])).rows[0].n;
    const result = await sell(productId, 2, `short-${randomUUID()}`);
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'INSUFFICIENT_STOCK');
    assert.equal((await pool.query('SELECT count(DISTINCT s.id)::int n FROM sale s JOIN sale_item si ON si.sale_id=s.id WHERE s.cashier_user_id=$1 AND si.product_id=$2', [cashierId, productId])).rows[0].n, 0);
    assert.equal((await pool.query('SELECT count(*)::int n FROM payment p JOIN sale s ON s.id=p.sale_id JOIN sale_item si ON si.sale_id=s.id WHERE p.recorded_by=$1 AND si.product_id=$2', [cashierId, productId])).rows[0].n, 0);
    assert.equal((await pool.query('SELECT qty_on_hand FROM inventory_lot WHERE id=$1', [lotIds[0]])).rows[0].qty_on_hand, '1.000');
    assert.equal((await pool.query('SELECT count(*)::int n FROM stock_movement WHERE lot_id=ANY($1::uuid[])', [lotIds])).rows[0].n, movementCount);
  });

  test('replays idempotent requests and rejects key reuse with another payload', async () => {
    const { productId } = await createProduct([{ expires_on: '2099-01-01', quantity: 5 }]);
    const key = `idem-${randomUUID()}`;
    const first = await sell(productId, 1, key);
    assert.equal(first.status, 200);
    saleIds.push(first.body.id);
    const replay = await sell(productId, 1, key);
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body, first.body);
    const reused = await sell(productId, 2, key);
    assert.equal(reused.status, 409);
    assert.equal(reused.body.code, 'IDEMPOTENCY_KEY_REUSED');
    assert.equal((await pool.query('SELECT count(DISTINCT s.id)::int n FROM sale s JOIN sale_item si ON si.sale_id=s.id WHERE s.cashier_user_id=$1 AND si.product_id=$2', [cashierId, productId])).rows[0].n, 1);
  });

  test('commits sale, payment, allocation, and stock deduction atomically', async () => {
    const { productId, lotIds } = await createProduct([{ expires_on: '2099-01-01', quantity: 3 }]);
    const result = await sell(productId, 2, `atomic-${randomUUID()}`);
    assert.equal(result.status, 200);
    saleIds.push(result.body.id);
    assert.equal((await pool.query('SELECT count(*)::int n FROM payment WHERE sale_id=$1 AND status=\'CAPTURED\'', [result.body.id])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int n FROM sale_item_lot sil JOIN sale_item si ON si.id=sil.sale_item_id WHERE si.sale_id=$1', [result.body.id])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT qty_on_hand FROM inventory_lot WHERE id=$1', [lotIds[0]])).rows[0].qty_on_hand, '1.000');
  });
});
