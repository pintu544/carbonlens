import { Router, type Request, type Response } from 'express';
import { pool } from '../db.js';
import {
  getAllCredits,
  getCredit,
  getFindings,
  getLatestVerification,
  runVerification,
  type CreditRow,
} from '../verifications.js';

export const creditsRouter = Router();

function toCreditSummary(row: CreditRow, verdict: string | null) {
  return {
    id: row.id,
    projectName: row.project_name,
    vintage: row.vintage,
    quantityTco2e: Number(row.quantity_tco2e),
    verdict,
    status: row.status,
  };
}

function toCreditDetail(row: CreditRow) {
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
    createdAt: row.created_at,
  };
}

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response): void => {
    fn(req, res).catch((err: unknown) => {
      console.error('api error:', err);
      res.status(500).json({ error: 'internal error' });
    });
  };

// GET /api/credits?verdict=&registry=&vintage=
creditsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { verdict, registry, vintage } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (typeof verdict === 'string' && verdict) {
      params.push(verdict);
      conditions.push(`v.verdict = $${params.length}`);
    }
    if (typeof registry === 'string' && registry) {
      params.push(registry);
      conditions.push(`c.registry = $${params.length}`);
    }
    if (typeof vintage === 'string' && vintage) {
      const y = Number(vintage);
      if (!Number.isInteger(y)) {
        res.status(400).json({ error: 'vintage must be an integer year' });
        return;
      }
      params.push(y);
      conditions.push(`c.vintage = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    // Latest verification per credit via DISTINCT ON (Postgres).
    const { rows } = await pool.query(
      `SELECT c.*, v.verdict AS latest_verdict
       FROM credits c
       LEFT JOIN LATERAL (
         SELECT verdict FROM verifications
         WHERE credit_id = c.id ORDER BY created_at DESC LIMIT 1
       ) v ON true
       ${where}
       ORDER BY c.id`,
      params
    );
    res.json(rows.map((r) => toCreditSummary(r as CreditRow, (r as { latest_verdict: string | null }).latest_verdict)));
  })
);

// GET /api/credits/:id → credit + findings + active verification + anchor receipt (null in slice 1)
creditsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await getCredit(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'credit not found' });
      return;
    }
    const [findings, verification, receipt] = await Promise.all([
      getFindings(row.id),
      getLatestVerification(row.id),
      pool.query('SELECT * FROM anchor_receipts WHERE credit_id = $1', [row.id]).then((r) => r.rows[0] ?? null),
    ]);
    res.json({ credit: toCreditDetail(row), findings, verification, anchorReceipt: receipt });
  })
);

const REQUIRED_STRING_FIELDS = ['id', 'registry', 'projectId', 'projectName'] as const;

function validateCreditBody(body: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'body must be a JSON object' };
  const b = body as Record<string, unknown>;
  for (const f of REQUIRED_STRING_FIELDS) {
    if (typeof b[f] !== 'string' || (b[f] as string).trim() === '') {
      return { ok: false, error: `field '${f}' is required and must be a non-empty string` };
    }
  }
  if (!Number.isInteger(b['vintage'])) return { ok: false, error: "field 'vintage' must be an integer year" };
  if (!Number.isInteger(b['serialStart']) || !Number.isInteger(b['serialEnd'])) {
    return { ok: false, error: "fields 'serialStart' and 'serialEnd' must be integers" };
  }
  if (typeof b['quantityTco2e'] !== 'number' || Number.isNaN(b['quantityTco2e'])) {
    return { ok: false, error: "field 'quantityTco2e' must be a number" };
  }
  if (typeof b['sourceDocHash'] !== 'string' || (b['sourceDocHash'] as string).trim() === '') {
    return { ok: false, error: "field 'sourceDocHash' is required and must be a non-empty string" };
  }
  // methodology / standard / proponent may be empty strings — the engine flags
  // them as provenance findings (GRILL Q6: missing fields → NEEDS_REVIEW, never a crash).
  return { ok: true, value: b };
}

// POST /api/credits → 201 { id }; 400 on bad input; 409 on duplicate id
creditsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const validated = validateCreditBody(req.body);
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }
    const b = validated.value;
    try {
      await pool.query(
        `INSERT INTO credits
           (id, registry, project_id, project_name, vintage, serial_start, serial_end,
            quantity_tco2e, methodology, standard, proponent, source_doc_hash, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft')`,
        [
          b['id'], b['registry'], b['projectId'], b['projectName'], b['vintage'],
          b['serialStart'], b['serialEnd'], b['quantityTco2e'],
          b['methodology'] ?? '', b['standard'] ?? '', b['proponent'] ?? '',
          b['sourceDocHash'],
        ]
      );
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23505') {
        res.status(409).json({ error: `credit '${String(b['id'])}' already exists` });
        return;
      }
      throw err;
    }
    res.status(201).json({ id: b['id'] });
  })
);

// POST /api/credits/:id/verify → runs engine, 200 { verdict, findings }; 404 if missing
creditsRouter.post(
  '/:id/verify',
  asyncHandler(async (req, res) => {
    const row = await getCredit(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'credit not found' });
      return;
    }
    const result = await runVerification(row.id, 'api');
    res.json({ verdict: result.verdict, findings: result.findings });
  })
);
