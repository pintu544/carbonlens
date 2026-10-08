import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, pool } from './db.js';
import { verifyCredit } from './engine.js';
import { buildContext, runVerification } from './verifications.js';
import 'dotenv/config';

const here = dirname(fileURLToPath(import.meta.url));

export interface FixtureCredit {
  id: string;
  registry: string;
  projectId: string;
  projectName: string;
  vintage: number;
  serialStart: number;
  serialEnd: number;
  quantityTco2e: number;
  methodology: string;
  standard: string;
  proponent: string;
  sourceDocHash: string;
  status?: string;
}

export interface FixtureProject {
  projectId: string;
  capacityTco2e: number;
}

export interface FixtureDataset {
  meta: { referenceTime: string };
  projects: FixtureProject[];
  credits: FixtureCredit[];
}

export function loadDataset(): FixtureDataset {
  const raw = readFileSync(join(here, '..', '..', 'fixtures', 'carbon-credits.json'), 'utf8');
  return JSON.parse(raw) as FixtureDataset;
}

export function loadFixtures(): FixtureCredit[] {
  return loadDataset().credits;
}

/**
 * Idempotent credit seed. INSERT ... ON CONFLICT DO NOTHING:
 * - running twice creates zero duplicates
 * - hand-added credits (different ids) are preserved
 * - existing rows are never overwritten (refresh never clobbers user data)
 */
export async function seedCredits(credits: FixtureCredit[]): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  for (const c of credits) {
    const res = await pool.query(
      `INSERT INTO credits
         (id, registry, project_id, project_name, vintage, serial_start, serial_end,
          quantity_tco2e, methodology, standard, proponent, source_doc_hash, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft')
       ON CONFLICT (id) DO NOTHING`,
      [
        c.id, c.registry, c.projectId, c.projectName, c.vintage,
        c.serialStart, c.serialEnd, c.quantityTco2e, c.methodology,
        c.standard, c.proponent, c.sourceDocHash,
      ]
    );
    if ((res.rowCount ?? 0) > 0) inserted++;
    else skipped++;
  }
  return { inserted, skipped };
}

/**
 * Idempotent verification seed. For each credit:
 * - no verification exists yet → run engine, store as source='seed'
 * - latest verification is source='seed' with a different findingsHash → re-run (supersedes)
 * - latest verification is source='api' or 'manual' → NEVER touch (user data wins)
 * Re-running with unchanged fixtures therefore creates zero new rows.
 */
export async function seedVerifications(dataset: FixtureDataset): Promise<{ inserted: number; skipped: number }> {
  const ctx = await buildContext();
  let inserted = 0;
  let skipped = 0;
  for (const credit of dataset.credits) {
    const { rows } = await pool.query(
      'SELECT findings_hash, source FROM verifications WHERE credit_id = $1 ORDER BY created_at DESC LIMIT 1',
      [credit.id]
    );
    const latest = rows[0] as { findings_hash: string; source: string } | undefined;
    if (latest && latest.source !== 'seed') {
      skipped++;
      continue;
    }
    const { findingsHash } = verifyCredit(credit, ctx);
    if (latest && latest.findings_hash === findingsHash) {
      skipped++;
      continue;
    }
    await runVerification(credit.id, 'seed');
    inserted++;
  }
  return { inserted, skipped };
}

async function main(): Promise<void> {
  await migrate();
  const dataset = loadDataset();
  const { inserted, skipped } = await seedCredits(dataset.credits);
  console.log(`seed: ${inserted} inserted, ${skipped} skipped (${dataset.credits.length} fixture credits)`);
  const v = await seedVerifications(dataset);
  console.log(`seed: ${v.inserted} verifications inserted, ${v.skipped} skipped`);
  await pool.end();
}

const isMain = process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js');
if (isMain) {
  main().catch((err) => {
    console.error('seed failed:', err);
    process.exit(1);
  });
}
