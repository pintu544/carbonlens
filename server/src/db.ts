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
