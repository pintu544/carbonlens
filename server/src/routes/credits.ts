import { Router, type Request, type Response } from 'express';
import { pool } from '../db.js';
import { parseVintageYear } from '../validate.js';
import {
  getAllCredits,
  getCredit,
  getFindings,
  getLatestVerification,
  runVerification,
  type CreditRow,
} from '../verifications.js';
import {
  AMOYSCAN_TX_URL,
  chainStatus,
  creditIdHash,
  enqueueJob,
  findAnchorTx,
  getOpenJob,
  isChainConfigured,
  kickChainWorker,
  readRecord,
  withTimeout,
  type AnchorJob,
} from '../chain.js';

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

function toAnchorReceipt(r: Record<string, any>) {
  return {
    creditIdHash: r.credit_id_hash,
    creditId: r.credit_id,
    txHash: r.tx_hash,
    blockNumber: r.block_number !== null && r.block_number !== undefined ? Number(r.block_number) : null,
    network: r.network,
    verdict: r.verdict,
    retired: Boolean(r.retired),
    retireTxHash: r.retire_tx_hash ?? null,
    retireAmoyScanUrl: r.retire_tx_hash ? AMOYSCAN_TX_URL(r.retire_tx_hash) : null,
    retiredAt: r.retired_at ?? null,
    amoyScanUrl: AMOYSCAN_TX_URL(r.tx_hash),
    createdAt: r.created_at,
  };
}

function toJob(j: AnchorJob) {
  return {
    id: j.id,
    creditId: j.credit_id,
    jobType: j.job_type,
    status: j.status,
    attempts: j.attempts,
    lastError: j.last_error,
    txHash: j.tx_hash,
    amoyScanUrl: j.tx_hash ? AMOYSCAN_TX_URL(j.tx_hash) : null,
    createdAt: j.created_at,
    updatedAt: j.updated_at,
  };
}

const VERDICT_NAME: Record<number, string> = { 1: 'VERIFIED', 2: 'NEEDS_REVIEW', 3: 'REJECTED' };

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
      const parsed = parseVintageYear(vintage);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      params.push(parsed.year);
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
    const [findings, verification, receipt, job] = await Promise.all([
      getFindings(row.id),
      getLatestVerification(row.id),
      pool.query('SELECT * FROM anchor_receipts WHERE credit_id = $1', [row.id]).then((r) => r.rows[0] ?? null),
      getOpenJob(row.id),
    ]);
    res.json({
      credit: toCreditDetail(row),
      findings,
      verification,
      anchorReceipt: receipt ? toAnchorReceipt(receipt) : null,
      anchorJob: job ? toJob(job) : null,
      chain: chainStatus(),
    });
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
  const vintage = parseVintageYear(b['vintage']);
  if (!vintage.ok) return { ok: false, error: `field 'vintage': ${vintage.error}` };
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
    // FR-2/FR-3: every credit gets a deterministic verdict at creation time,
    // so no credit is ever left without one.
    let verdict: string | null = null;
    try {
      const result = await runVerification(String(b['id']), 'manual');
      verdict = result.verdict;
    } catch (err) {
      console.error(`auto-verify failed for credit ${String(b['id'])}:`, err);
    }
    res.status(201).json({ id: b['id'], verdict });
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

// POST /api/credits/:id/anchor → queues an Amoy anchor tx.
// 202 { status: 'pending', job } — the worker mines it async; the UI polls the
// detail endpoint. 409 { receipt } if already anchored (off-chain guard first,
// then an on-chain pre-check). 404 / 422 / 503 as appropriate.
creditsRouter.post(
  '/:id/anchor',
  asyncHandler(async (req, res) => {
    const row = await getCredit(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'credit not found' });
      return;
    }
    if (!isChainConfigured()) {
      res.status(503).json({ error: 'on-chain anchoring is not configured on this server' });
      return;
    }
    // FR-5, off-chain enforcement: a recorded receipt rejects immediately.
    const rec = await pool.query('SELECT * FROM anchor_receipts WHERE credit_id = $1', [row.id]);
    if (rec.rows.length > 0) {
      res.status(409).json({ error: 'credit already anchored', receipt: toAnchorReceipt(rec.rows[0]) });
      return;
    }
    const verification = await getLatestVerification(row.id);
    if (!verification) {
      res.status(422).json({ error: 'credit has no verification to anchor' });
      return;
    }
    // FR-5, second layer: the chain itself may hold a record our DB missed
    // (anchored outside this API). Bounded to ~2s total per NFR-2 (the UI must
    // never block on chain calls); a timeout here just queues the job, and the
    // worker re-checks on-chain before submitting, so nothing is lost.
    const idHash = creditIdHash(row.id);
    try {
      const record = await withTimeout(readRecord(idHash), 1_200, 'anchor pre-check');
      if (record.exists) {
        const found = await withTimeout(findAnchorTx(idHash), 600, 'anchor tx recovery').catch(
          () => null
        );
        if (found) {
          await pool.query(
            `INSERT INTO anchor_receipts (credit_id_hash, credit_id, tx_hash, block_number, network, verdict)
             VALUES ($1, $2, $3, $4, 'amoy', $5)
             ON CONFLICT (credit_id_hash) DO NOTHING`,
            [idHash, row.id, found.txHash, found.blockNumber, verification.verdict]
          );
          await pool.query(`UPDATE credits SET status = 'anchored' WHERE id = $1`, [row.id]);
          const saved = await pool.query('SELECT * FROM anchor_receipts WHERE credit_id = $1', [
            row.id,
          ]);
          res
            .status(409)
            .json({ error: 'credit already anchored on-chain', receipt: toAnchorReceipt(saved.rows[0]) });
        } else {
          res.status(409).json({
            error: 'credit already anchored on-chain',
            receipt: {
              creditId: row.id,
              creditIdHash: idHash,
              txHash: null,
              amoyScanUrl: null,
              verdict: VERDICT_NAME[record.verdict ?? 0] ?? 'UNKNOWN',
              note: 'record exists on-chain but the anchoring tx was not found in event logs',
            },
          });
        }
        return;
      }
    } catch (err) {
      // RPC hiccup on the pre-check: fall through and queue; the worker
      // re-checks on-chain before submitting. Never fail the request for this.
      console.warn('[anchor] pre-check chain read failed, queueing anyway:', (err as Error).message);
    }
    const job = await enqueueJob(row.id, 'anchor');
    kickChainWorker();
    res.status(202).json({ status: job.status, job: toJob(job) });
  })
);

// POST /api/credits/:id/retire → queues an Amoy retire tx (202 pending).
// 409 when the credit is not anchored or already retired (FR-8).
creditsRouter.post(
  '/:id/retire',
  asyncHandler(async (req, res) => {
    const row = await getCredit(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'credit not found' });
      return;
    }
    if (!isChainConfigured()) {
      res.status(503).json({ error: 'on-chain anchoring is not configured on this server' });
      return;
    }
    const rec = await pool.query('SELECT * FROM anchor_receipts WHERE credit_id = $1', [row.id]);
    if (rec.rows.length === 0) {
      res.status(409).json({ error: 'credit is not anchored — anchor it before retiring' });
      return;
    }
    if (rec.rows[0].retired) {
      res
        .status(409)
        .json({ error: 'credit already retired', receipt: toAnchorReceipt(rec.rows[0]) });
      return;
    }
    const job = await enqueueJob(row.id, 'retire');
    kickChainWorker();
    res.status(202).json({ status: job.status, job: toJob(job) });
  })
);
