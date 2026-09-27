import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';

const { Pool } = pg;
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined
});
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrationFiles = (await readdir(path.resolve(currentDirectory, '../migrations')))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const migrationFile of migrationFiles) {
    const existingMigration = await pool.query(
      'SELECT checksum FROM schema_migrations WHERE version = $1',
      [migrationFile]
    );

    if (existingMigration.rowCount) {
      continue;
    }

    const sql = await readFile(
      path.resolve(currentDirectory, '../migrations', migrationFile),
      'utf8'
    );
    const { createHash } = await import('node:crypto');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)',
        [migrationFile, checksum]
      );
      await client.query('COMMIT');
      console.log(`applied ${migrationFile}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
