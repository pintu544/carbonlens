import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import 'dotenv/config';

const here = dirname(fileURLToPath(import.meta.url));

function buildPool(): Pool {
  const connectionString =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/carbonlens';
  // Render Postgres requires SSL; the egress proxy breaks it from this VM, but the
  // deployed server connects directly, so SSL stays on when DATABASE_SSL=require.
  const ssl = process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined;
  return new Pool({ connectionString, ssl, max: 10 });
}

export const pool = buildPool();

/**
 * Ensure the target database exists, creating it when missing.
 * Connects to the `postgres` maintenance database on the same instance and
 * runs CREATE DATABASE (idempotent). This lets a fresh Render deploy
 * self-provision its database without dashboard psql access.
 * Skipped unless BOOTSTRAP_DB=true. Requires the connecting role to have
 * CREATEDB privilege (true for Render's default instance user).
 */
export async function ensureDatabase(): Promise<void> {
  if (process.env.BOOTSTRAP_DB !== 'true') return;
  const target = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/carbonlens';
  const url = new URL(target);
  const dbName = url.pathname.replace(/^\//, '') || 'carbonlens';
  if (!/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(dbName)) {
    throw new Error(`refusing to bootstrap database with suspicious name: ${dbName}`);
  }
  const adminUrl = new URL(target);
  adminUrl.pathname = '/postgres';
  const ssl = process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined;
  const admin = new Pool({ connectionString: adminUrl.toString(), ssl, max: 1 });
  try {
    await admin.query(`CREATE DATABASE "${dbName}"`);
    console.log(`bootstrap: created database "${dbName}"`);
  } catch (err: unknown) {
    // 42P04 = duplicate_database — already exists, which is fine.
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === '42P04') {
      console.log(`bootstrap: database "${dbName}" already exists`);
    } else {
      throw err;
    }
  } finally {
    await admin.end();
  }
}

/** Apply schema.sql idempotently. Safe to run on every boot. */
export async function migrate(): Promise<void> {
  const sql = readFileSync(join(here, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
  } finally {
    client.release();
  }
}
