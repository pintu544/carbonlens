/**
 * Chain service — Polygon Amoy anchoring via ethers v6, with an async retry queue.
 *
 * Design (SPEC NFR-2, DESIGN.md):
 *  - The chain is a write-only trust anchor, never in the read path. Verification
 *    works with zero chain access; if the chain is unconfigured the server boots
 *    fine and anchor/retire endpoints return 503.
 *  - Anchoring is async: POST /anchor enqueues a job and returns 202 immediately.
 *    A background worker submits the tx, waits for it to mine, and persists the
 *    receipt. The UI polls the credit detail endpoint (pending -> confirmed).
 *  - Honesty (NFR-4): tx hashes are recorded ONLY from mined receipts. A job that
 *    has not mined is "pending", never shown with a hash.
 *  - Double-anchor is guarded off-chain (409 before submit) AND on-chain (the
 *    contract reverts); a revert races is recovered via the Anchored event log.
 */
import { createHash } from 'node:crypto';
import { ethers } from 'ethers';
import { pool } from './db.js';

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** Verdict codes mirror CarbonLensRegistry.sol exactly. */
export const VERDICT_CODE: Record<string, number> = {
  VERIFIED: 1,
  NEEDS_REVIEW: 2,
  REJECTED: 3,
};

export const AMOYSCAN_TX_URL = (txHash: string): string =>
  `https://amoy.polygonscan.com/tx/${txHash}`;
export const AMOYSCAN_ADDRESS_URL = (address: string): string =>
  `https://amoy.polygonscan.com/address/${address}`;

/**
 * creditIdHash convention (MUST match contracts/: sha256 of the UTF-8 credit
 * ID, as bytes32 — not keccak256).
 */
export function creditIdHash(creditId: string): string {
  return '0x' + createHash('sha256').update(creditId, 'utf8').digest('hex');
}

/** Normalize a 64-char hex findings hash to 0x-prefixed bytes32. */
export function toBytes32(hex: string): string {
  const h = hex.startsWith('0x') ? hex : `0x${hex}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(h)) {
    throw new Error('hash must be 32 bytes of hex');
  }
  return h.toLowerCase();
}

/**
 * Exponential backoff between job attempts (seconds), capped at 30 min.
 * Mirrors the claimNextJob SQL: fresh jobs (attempts = 0) run immediately.
 */
export function backoffSeconds(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(5 * Math.pow(3, attempts - 1), 1800);
}

export const MAX_ATTEMPTS = 12;

/** Bounded promise: no chain call may hang the worker forever. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(timer)), timeout]);
}

// ---------------------------------------------------------------------------
// Configuration / connection
// ---------------------------------------------------------------------------

/** Minimal ABI — includes custom errors so ethers decodes revert reasons. */
export const REGISTRY_ABI = [
  'function anchorVerification(bytes32 creditIdHash, bytes32 findingsHash, uint8 verdict) external',
  'function retireCredit(bytes32 creditIdHash) external',
  'function records(bytes32) external view returns (bytes32 findingsHash, uint8 verdict, uint64 timestamp, bool retired)',
  'event Anchored(bytes32 indexed creditIdHash, bytes32 findingsHash, uint8 verdict, uint64 timestamp)',
  'event Retired(bytes32 indexed creditIdHash, uint64 timestamp)',
  // Custom errors are in the ABI so ethers decodes revert reasons —
  // the worker matches /AlreadyAnchored/ etc. on these decoded names.
  'error AlreadyAnchored(bytes32 creditIdHash)',
  'error NotAnchored(bytes32 creditIdHash)',
  'error AlreadyRetired(bytes32 creditIdHash)',
  'error InvalidVerdict(uint8 verdict)',
] as const;

export function isChainConfigured(): boolean {
  return Boolean(
    process.env.AMOY_RPC_URL &&
      process.env.DEPLOYER_PRIVATE_KEY &&
      process.env.CONTRACT_ADDRESS
  );
}

export function chainStatus(): {
  configured: boolean;
  network: string;
  contractAddress: string | null;
  amoyScanAddressUrl: string | null;
} {
  const configured = isChainConfigured();
  const contractAddress = process.env.CONTRACT_ADDRESS || null;
  return {
    configured,
    network: 'amoy',
    contractAddress,
    amoyScanAddressUrl: contractAddress ? AMOYSCAN_ADDRESS_URL(contractAddress) : null,
  };
}

interface ChainHandles {
  contract: ethers.Contract;
  address: string;
}

function getHandles(): ChainHandles {
  if (!isChainConfigured()) throw new Error('chain not configured');
  const provider = new ethers.JsonRpcProvider(process.env.AMOY_RPC_URL);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY as string, provider);
  const address = process.env.CONTRACT_ADDRESS as string;
  const contract = new ethers.Contract(address, REGISTRY_ABI, wallet);
  return { contract, address };
}

export interface OnChainRecord {
  exists: boolean;
  findingsHash: string | null;
  verdict: number | null;
  timestamp: bigint;
  retired: boolean;
}

/** Read-only view call — fast, never sends a transaction. */
export async function readRecord(idHash: string): Promise<OnChainRecord> {
  const { contract } = getHandles();
  const r = await withTimeout(contract.records(idHash), 20_000, 'records() view call');
  const timestamp = r.timestamp as bigint;
  return {
    exists: timestamp !== 0n,
    findingsHash: timestamp !== 0n ? (r.findingsHash as string) : null,
    verdict: timestamp !== 0n ? Number(r.verdict) : null,
    timestamp,
    retired: Boolean(r.retired),
  };
}

/**
 * Recover a mined anchor's tx hash from the Anchored event log (used when the
 * DB receipt is missing but the chain already has the record — e.g. after a
 * double-anchor revert race).
 */
export async function findAnchorTx(
  idHash: string
): Promise<{ txHash: string; blockNumber: number } | null> {
  const { contract } = getHandles();
  const events = await withTimeout(
    contract.queryFilter(contract.filters.Anchored(idHash)),
    30_000,
    'Anchored event lookup'
  );
  if (events.length === 0) return null;
  const last = events[events.length - 1];
  return { txHash: last.transactionHash, blockNumber: last.blockNumber };
}

// ---------------------------------------------------------------------------
// Job queue (persisted in anchor_jobs; survives restarts)
// ---------------------------------------------------------------------------

export type JobType = 'anchor' | 'retire';
export type JobStatus = 'pending' | 'processing' | 'confirmed' | 'failed';

export interface AnchorJob {
  id: number;
  credit_id: string;
  job_type: JobType;
  status: JobStatus;
  attempts: number;
  last_error: string | null;
  tx_hash: string | null;
  created_at: string;
  updated_at: string;
}

/** Enqueue a job; returns the existing open job instead of double-queueing. */
export async function enqueueJob(creditId: string, jobType: JobType): Promise<AnchorJob> {
  await pool.query(
    `INSERT INTO anchor_jobs (credit_id, job_type, status)
     VALUES ($1, $2, 'pending')
     ON CONFLICT DO NOTHING`,
    [creditId, jobType]
  );
  const { rows } = await pool.query(
    `SELECT * FROM anchor_jobs
     WHERE credit_id = $1 AND job_type = $2 AND status IN ('pending', 'processing')
     ORDER BY id DESC LIMIT 1`,
    [creditId, jobType]
  );
  if (rows.length === 0) throw new Error('failed to enqueue chain job');
  return rows[0] as AnchorJob;
}

/** Fetch the open (pending/processing) job for a credit, if any. */
export async function getOpenJob(creditId: string): Promise<AnchorJob | null> {
  const { rows } = await pool.query(
    `SELECT * FROM anchor_jobs
     WHERE credit_id = $1 AND status IN ('pending', 'processing')
     ORDER BY id DESC LIMIT 1`,
    [creditId]
  );
  return (rows[0] as AnchorJob | undefined) ?? null;
}

async function setJobStatus(
  id: number,
  status: JobStatus,
  fields: { lastError?: string | null; txHash?: string | null } = {}
): Promise<void> {
  await pool.query(
    `UPDATE anchor_jobs SET status = $2, last_error = $3, tx_hash = $4, updated_at = NOW()
     WHERE id = $1`,
    [id, status, fields.lastError ?? null, fields.txHash ?? null]
  );
}

async function requeueJob(id: number, lastError: string): Promise<void> {
  await pool.query(
    `UPDATE anchor_jobs SET status = 'pending', last_error = $2, updated_at = NOW()
     WHERE id = $1`,
    [id, lastError]
  );
}

/** Claim the next due job (respects exponential backoff), or null. */
async function claimNextJob(): Promise<AnchorJob | null> {
  const { rows } = await pool.query(
    `UPDATE anchor_jobs SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
     WHERE id = (
       SELECT id FROM anchor_jobs
       WHERE status = 'pending'
         -- Fresh jobs (attempts = 0) run immediately; retries back off.
         AND (attempts = 0 OR updated_at <= NOW() - (LEAST(5 * POWER(3, attempts - 1), 1800) || ' seconds')::interval)
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`
  );
  return (rows[0] as AnchorJob | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Job execution
// ---------------------------------------------------------------------------

async function persistAnchorReceipt(
  creditId: string,
  idHash: string,
  txHash: string,
  blockNumber: number,
  verdict: string
): Promise<void> {
  await pool.query(
    `INSERT INTO anchor_receipts (credit_id_hash, credit_id, tx_hash, block_number, network, verdict)
     VALUES ($1, $2, $3, $4, 'amoy', $5)
     ON CONFLICT (credit_id_hash) DO NOTHING`,
    [idHash, creditId, txHash, blockNumber, verdict]
  );
  await pool.query(`UPDATE credits SET status = 'anchored' WHERE id = $1`, [creditId]);
}

async function runAnchorJob(job: AnchorJob): Promise<void> {
  const { rows } = await pool.query('SELECT * FROM credits WHERE id = $1', [job.credit_id]);
  const credit = rows[0];
  if (!credit) {
    await setJobStatus(job.id, 'failed', { lastError: 'credit no longer exists' });
    return;
  }
  // Off-chain idempotency: receipt already recorded → nothing to do.
  const existing = await pool.query('SELECT * FROM anchor_receipts WHERE credit_id = $1', [
    job.credit_id,
  ]);
  if (existing.rows.length > 0) {
    await setJobStatus(job.id, 'confirmed', { txHash: existing.rows[0].tx_hash });
    return;
  }
  const ver = await pool.query(
    `SELECT * FROM verifications WHERE credit_id = $1 ORDER BY id DESC LIMIT 1`,
    [job.credit_id]
  );
  if (ver.rows.length === 0) {
    await setJobStatus(job.id, 'failed', { lastError: 'credit has no verification to anchor' });
    return;
  }
  const verification = ver.rows[0];
  const idHash = creditIdHash(job.credit_id);
  const findingsBytes32 = toBytes32(verification.findings_hash);
  const verdictCode = VERDICT_CODE[verification.verdict];
  if (!verdictCode) {
    await setJobStatus(job.id, 'failed', { lastError: `unknown verdict ${verification.verdict}` });
    return;
  }

  const { contract } = getHandles();
  try {
    // On-chain idempotency: someone may have anchored outside our DB.
    const record = await readRecord(idHash);
    if (record.exists) {
      const found = await findAnchorTx(idHash);
      if (found) {
        await persistAnchorReceipt(
          job.credit_id,
          idHash,
          found.txHash,
          found.blockNumber,
          verification.verdict
        );
        await setJobStatus(job.id, 'confirmed', { txHash: found.txHash });
      } else {
        await setJobStatus(job.id, 'failed', {
          lastError: 'already anchored on-chain (record exists, tx not found in logs)',
        });
      }
      return;
    }

    const tx = await withTimeout(
      contract.anchorVerification(idHash, findingsBytes32, verdictCode),
      60_000,
      'anchorVerification send'
    );
    const txHash = tx.hash as string;
    await setJobStatus(job.id, 'processing', { txHash });
    // Honesty: the receipt is persisted ONLY after the tx actually mines.
    const receipt = (await withTimeout(
      tx.wait(1),
      180_000,
      'anchor tx mining'
    )) as unknown as { blockNumber: number | bigint; hash: string } | null;
    if (!receipt) throw new Error('anchor tx receipt was null after mining wait');
    const blockNumber = Number(receipt.blockNumber);
    await persistAnchorReceipt(job.credit_id, idHash, txHash, blockNumber, verification.verdict);
    await setJobStatus(job.id, 'confirmed', { txHash });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Lost race: the contract reverted because the record now exists.
    if (/AlreadyAnchored/.test(message)) {
      const found = await findAnchorTx(idHash).catch(() => null);
      if (found) {
        await persistAnchorReceipt(
          job.credit_id,
          idHash,
          found.txHash,
          found.blockNumber,
          verification.verdict
        );
        await setJobStatus(job.id, 'confirmed', { txHash: found.txHash });
        return;
      }
    }
    if (job.attempts >= MAX_ATTEMPTS) {
      await setJobStatus(job.id, 'failed', { lastError: message.slice(0, 500) });
    } else {
      await requeueJob(job.id, message.slice(0, 500));
    }
  }
}

async function runRetireJob(job: AnchorJob): Promise<void> {
  const rec = await pool.query('SELECT * FROM anchor_receipts WHERE credit_id = $1', [job.credit_id]);
  if (rec.rows.length === 0) {
    await setJobStatus(job.id, 'failed', { lastError: 'credit is not anchored' });
    return;
  }
  if (rec.rows[0].retired) {
    await setJobStatus(job.id, 'confirmed', { txHash: rec.rows[0].retire_tx_hash });
    return;
  }
  const idHash = creditIdHash(job.credit_id);
  const { contract } = getHandles();
  try {
    const record = await readRecord(idHash);
    if (!record.exists) {
      await setJobStatus(job.id, 'failed', { lastError: 'credit not anchored on-chain' });
      return;
    }
    if (record.retired) {
      // Converge: chain says retired, DB missed it.
      await pool.query(
        `UPDATE anchor_receipts SET retired = TRUE, retired_at = NOW() WHERE credit_id = $1`,
        [job.credit_id]
      );
      await pool.query(`UPDATE credits SET status = 'retired' WHERE id = $1`, [job.credit_id]);
      await setJobStatus(job.id, 'confirmed');
      return;
    }
    const tx = await withTimeout(contract.retireCredit(idHash), 60_000, 'retireCredit send');
    const txHash = tx.hash as string;
    await setJobStatus(job.id, 'processing', { txHash });
    const receipt = (await withTimeout(
      tx.wait(1),
      180_000,
      'retire tx mining'
    )) as unknown as { blockNumber: number | bigint; hash: string } | null;
    void receipt;
    await pool.query(
      `UPDATE anchor_receipts SET retired = TRUE, retire_tx_hash = $2, retired_at = NOW()
       WHERE credit_id = $1`,
      [job.credit_id, txHash]
    );
    await pool.query(`UPDATE credits SET status = 'retired' WHERE id = $1`, [job.credit_id]);
    await setJobStatus(job.id, 'confirmed', { txHash });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/AlreadyRetired/.test(message)) {
      await pool.query(
        `UPDATE anchor_receipts SET retired = TRUE, retired_at = NOW() WHERE credit_id = $1`,
        [job.credit_id]
      );
      await pool.query(`UPDATE credits SET status = 'retired' WHERE id = $1`, [job.credit_id]);
      await setJobStatus(job.id, 'confirmed');
      return;
    }
    if (job.attempts >= MAX_ATTEMPTS) {
      await setJobStatus(job.id, 'failed', { lastError: message.slice(0, 500) });
    } else {
      await requeueJob(job.id, message.slice(0, 500));
    }
  }
}

// ---------------------------------------------------------------------------
// Background worker
// ---------------------------------------------------------------------------

const POLL_MS = 10_000;
let workerTimer: ReturnType<typeof setInterval> | null = null;
let workerBusy = false;

async function processNextJob(): Promise<void> {
  if (workerBusy) return;
  workerBusy = true;
  try {
    const job = await claimNextJob();
    if (!job) return;
    if (job.job_type === 'anchor') await runAnchorJob(job);
    else if (job.job_type === 'retire') await runRetireJob(job);
    else await setJobStatus(job.id, 'failed', { lastError: `unknown job type ${job.job_type}` });
  } catch (err) {
    console.error('[chain worker] unexpected error:', err instanceof Error ? err.message : err);
  } finally {
    workerBusy = false;
  }
}

/** Start the background retry worker. No-op when the chain is unconfigured. */
export function startChainWorker(): void {
  if (!isChainConfigured()) {
    console.log('[chain] not configured (AMOY_RPC_URL / DEPLOYER_PRIVATE_KEY / CONTRACT_ADDRESS) — anchor/retire disabled, verification unaffected');
    return;
  }
  if (workerTimer) return;
  console.log('[chain] worker started — contract', process.env.CONTRACT_ADDRESS);
  workerTimer = setInterval(() => {
    void processNextJob();
  }, POLL_MS);
  void processNextJob();
}

/** Nudge the worker to pick up a newly enqueued job without waiting for the poll. */
export function kickChainWorker(): void {
  if (!workerTimer) return;
  setImmediate(() => void processNextJob());
}
