import { pool } from './db.js';
import { ENGINE_VERSION, verifyCredit, type EngineContext, type VerificationResult } from './engine.js';
import { loadDataset, type FixtureCredit } from './seed.js';

export interface CreditRow {
  id: string;
  registry: string;
  project_id: string;
  project_name: string;
  vintage: number;
  serial_start: string;
  serial_end: string;
  quantity_tco2e: string;
  methodology: string;
  standard: string;
  proponent: string;
  source_doc_hash: string;
  status: string;
  created_at: string;
}

function toCreditInput(row: CreditRow): FixtureCredit {
  return {
    id: row.id,
    registry: row.registry,
    projectId: row.project_id,
    projectName: row.project_name,
    vintage: row.vintage,
    serialStart: Number(row.serial_start),
    serialEnd: Number(row.serial_end),
    quantityTco2e: Number(row.quantity_tco2e),
    methodology: row.methodology,
    standard: row.standard,
    proponent: row.proponent,
    sourceDocHash: row.source_doc_hash,
    status: row.status,
  };
}

export async function getAllCredits(): Promise<CreditRow[]> {
  const { rows } = await pool.query('SELECT * FROM credits ORDER BY id');
  return rows as CreditRow[];
}

export async function getCredit(id: string): Promise<CreditRow | null> {
  const { rows } = await pool.query('SELECT * FROM credits WHERE id = $1', [id]);
  return (rows[0] as CreditRow | undefined) ?? null;
}

/** Engine context built from live DB state (includes hand-added credits). */
export async function buildContext(anchoredCreditIds?: Set<string>): Promise<EngineContext> {
  const dataset = loadDataset();
  const credits = (await getAllCredits()).map(toCreditInput);
  return {
    credits,
    capacities: Object.fromEntries(dataset.projects.map((p) => [p.projectId, p.capacityTco2e])),
    referenceTime: dataset.meta.referenceTime,
    anchoredCreditIds,
  };
}

export interface LatestVerification {
  id: number;
  credit_id: string;
  verdict: string;
  findings_hash: string;
  engine_version: string;
  source: string;
  created_at: string;
}

export async function getLatestVerification(creditId: string): Promise<LatestVerification | null> {
  const { rows } = await pool.query(
    'SELECT * FROM verifications WHERE credit_id = $1 ORDER BY created_at DESC LIMIT 1',
    [creditId]
  );
  return (rows[0] as LatestVerification | undefined) ?? null;
}

export interface FindingRow {
  id: number;
  check_type: string;
  severity: string;
  message: string;
  details: unknown;
}

export async function getFindings(creditId: string): Promise<FindingRow[]> {
  const { rows } = await pool.query(
    'SELECT id, check_type, severity, message, details FROM findings WHERE credit_id = $1 ORDER BY id',
    [creditId]
  );
  return rows as FindingRow[];
}

/**
 * Runs the deterministic engine for a credit and persists the result.
 * Findings are replaced (they are derived data); the verification row is
 * appended so history is preserved. Wrapped in a transaction.
 */
export async function runVerification(
  creditId: string,
  source: 'seed' | 'api' | 'manual'
): Promise<VerificationResult & { verificationId: number }> {
  const row = await getCredit(creditId);
  if (!row) throw new Error(`credit not found: ${creditId}`);
  const ctx = await buildContext();
  const result = verifyCredit(toCreditInput(row), ctx);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO verifications (credit_id, verdict, findings_hash, engine_version, source)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [creditId, result.verdict, result.findingsHash, ENGINE_VERSION, source]
    );
    const verificationId = (rows[0] as { id: number }).id;
    await client.query('DELETE FROM findings WHERE credit_id = $1', [creditId]);
    for (const f of result.findings) {
      await client.query(
        `INSERT INTO findings (credit_id, check_type, severity, message, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [creditId, f.checkType, f.severity, f.message, JSON.stringify(f.details)]
      );
    }
    await client.query('COMMIT');
    return { ...result, verificationId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
