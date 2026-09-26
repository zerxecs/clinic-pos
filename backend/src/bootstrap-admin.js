import 'dotenv/config';
import pg from 'pg';
import argon2 from 'argon2';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
const {Pool}=pg;
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const rl=createInterface({input:stdin,output:stdout});
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
try {
 const existing=await pool.query("SELECT 1 FROM app_user u JOIN user_role ur ON ur.user_id=u.id JOIN role r ON r.id=ur.role_id WHERE u.is_active AND r.code='ADMIN' LIMIT 1");
 if(existing.rowCount) throw new Error('An active Admin already exists; refusing to create another bootstrap account.');
 const username=(await rl.question('Admin username: ')).trim().toLowerCase();
 const display=(await rl.question('Admin display name: ')).trim();
 const password=await rl.question('Admin password (12+ characters): ');
 if(!/^[a-z0-9._-]{3,80}$/.test(username)||!display||password.length<12) throw new Error('Invalid username, display name, or password length.');
 const hash=await argon2.hash(password,{type:argon2.argon2id});
 const c=await pool.connect();try{await c.query('BEGIN');const user=(await c.query('INSERT INTO app_user(username,password_hash,display_name) VALUES($1,$2,$3) RETURNING id',[username,hash,display])).rows[0];await c.query("INSERT INTO user_role(user_id,role_id) SELECT $1,id FROM role WHERE code='ADMIN'",[user.id]);await c.query("INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id) VALUES($1,'BOOTSTRAP_ADMIN_CREATED','app_user',$1)",[user.id]);await c.query('COMMIT');console.log('Created initial Admin '+username+' ('+user.id+').')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
} finally {rl.close();await pool.end()}
