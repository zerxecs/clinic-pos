import 'dotenv/config';
import pg from 'pg';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { validateAdminCredentials, hashAdminPassword } from './admin-credentials.js';

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined });

async function hiddenPrompt(label) {
  if (!stdin.isTTY || !stdin.setRawMode) throw new Error('Set ADMIN_PASSWORD in the environment when running without an interactive terminal.');
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const done = (error) => {
      stdin.setRawMode(false);
      stdin.removeListener('data', onData);
      stdout.write('\n');
      error ? reject(error) : resolve(value);
    };
    const onData = (chunk) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') return done(new Error('Admin bootstrap cancelled.'));
        if (char === '\r' || char === '\n') return done();
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    stdin.on('data', onData);
  });
}

let rl;
try {
  const existing = await pool.query("SELECT 1 FROM app_user u JOIN user_role ur ON ur.user_id=u.id JOIN role r ON r.id=ur.role_id WHERE u.is_active AND r.code='ADMIN' LIMIT 1");
  if (existing.rowCount) throw new Error('An active Admin already exists; refusing to create another bootstrap account.');
  const allFromEnv = process.env.ADMIN_USERNAME && process.env.ADMIN_DISPLAY_NAME && process.env.ADMIN_PASSWORD;
  if (!allFromEnv && !stdin.isTTY) throw new Error('Set ADMIN_USERNAME, ADMIN_DISPLAY_NAME, and ADMIN_PASSWORD for non-interactive bootstrap.');
  rl = createInterface({ input: stdin, output: stdout });
  const username = process.env.ADMIN_USERNAME ?? await rl.question('Admin username: ');
  const displayName = process.env.ADMIN_DISPLAY_NAME ?? await rl.question('Admin display name: ');
  rl.close();
  rl = undefined;
  const password = process.env.ADMIN_PASSWORD ?? await hiddenPrompt('Admin password (12+ characters): ');
  const credentials = validateAdminCredentials({ username, displayName, password });
  const passwordHash = await hashAdminPassword(credentials.password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = (await client.query('INSERT INTO app_user(username,password_hash,display_name) VALUES($1,$2,$3) RETURNING id', [credentials.username, passwordHash, credentials.displayName])).rows[0];
    await client.query("INSERT INTO user_role(user_id,role_id) SELECT $1,id FROM role WHERE code='ADMIN'", [user.id]);
    await client.query("INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id) VALUES($1,'BOOTSTRAP_ADMIN_CREATED','app_user',$1)", [user.id]);
    await client.query('COMMIT');
    console.log('Created initial Admin account.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
} finally {
  rl?.close();
  await pool.end();
}
