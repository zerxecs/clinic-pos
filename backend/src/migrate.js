import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
const {Pool}=pg;
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
const here=path.dirname(fileURLToPath(import.meta.url));
try {
 await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
 const files=(await readdir(path.resolve(here,'../migrations'))).filter(f=>f.endsWith('.sql')).sort();
 for(const file of files){const found=await pool.query('SELECT checksum FROM schema_migrations WHERE version=$1',[file]);if(found.rowCount)continue;const sql=await readFile(path.resolve(here,'../migrations',file),'utf8');const {createHash}=await import('node:crypto');const checksum=createHash('sha256').update(sql).digest('hex');const client=await pool.connect();try{await client.query('BEGIN');await client.query(sql);await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[file,checksum]);await client.query('COMMIT');console.log(`applied ${file}`)}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
} finally {await pool.end()}
