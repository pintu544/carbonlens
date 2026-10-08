import { createHash } from 'node:crypto';

/**
 * Deterministic verification engine (pure TypeScript, no I/O).
 *
 * The engine — and only the engine — decides verdicts. The LLM (slice 3)
 * explains findings but never influences them, so results are reproducible
 * and auditable. Same input → same verdict, byte-identical findings hash.
 */

export type Verdict = 'VERIFIED' | 'NEEDS_REVIEW' | 'REJECTED';
export type CheckType = 'duplicate' | 'provenance' | 'anomaly';
export type Severity = 'info' | 'warning' | 'critical';

export interface Finding {
  checkType: CheckType;
  severity: Severity;
  message: string;
  details: Record<string, unknown>;
}

export interface VerificationResult {
  verdict: Verdict;
  findings: Finding[];
  /** sha256 over the canonical (key-sorted) findings JSON — stable across runs. */
  findingsHash: string;
}

export interface CreditInput {
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

export interface EngineContext {
  /** All known credits, used for duplicate detection (includes the credit itself). */
  credits: CreditInput[];
  /** projectId -> lifetime capacity in tCO2e, for the volume-vs-capacity check. */
  capacities: Record<string, number>;
  /** ISO instant, e.g. '2026-10-01T00:00:00Z'. Vintages after its year are "future". */
  referenceTime: string;
  /** Credit IDs with a confirmed on-chain anchor (slice 2). */
  anchoredCreditIds?: Set<string>;
}

export const ENGINE_VERSION = '1.0.0';

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Canonical JSON: object keys sorted recursively, so hashing is stable. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function hashFindings(findings: Finding[]): string {
  const canonical = JSON.stringify(canonicalize(findings));
  return createHash('sha256').update(canonical).digest('hex');
}

function duplicateChecks(credit: CreditInput, ctx: EngineContext): Finding[] {
  const findings: Finding[] = [];
  for (const other of ctx.credits) {
    if (other.id === credit.id) continue;
    if (
      other.sourceDocHash &&
      credit.sourceDocHash &&
      other.sourceDocHash === credit.sourceDocHash
    ) {
      findings.push({
        checkType: 'duplicate',
        severity: 'critical',
        message: `Source document hash is also claimed by credit ${other.id}`,
        details: { creditId: credit.id, conflictingCreditId: other.id, sourceDocHash: credit.sourceDocHash },
      });
    }
    if (
      other.registry === credit.registry &&
      rangesOverlap(credit.serialStart, credit.serialEnd, other.serialStart, other.serialEnd)
    ) {
      findings.push({
        checkType: 'duplicate',
        severity: 'critical',
        message: `Serial range overlaps credit ${other.id} (${other.serialStart}-${other.serialEnd})`,
        details: {
          creditId: credit.id,
          conflictingCreditId: other.id,
          serialRange: [credit.serialStart, credit.serialEnd],
          conflictingSerialRange: [other.serialStart, other.serialEnd],
        },
      });
    }
  }
  return findings;
}

const REQUIRED_FIELDS: Array<{ key: keyof CreditInput; label: string }> = [
  { key: 'registry', label: 'registry' },
  { key: 'projectId', label: 'project ID' },
  { key: 'vintage', label: 'vintage' },
  { key: 'methodology', label: 'methodology' },
  { key: 'standard', label: 'standard' },
  { key: 'proponent', label: 'proponent' },
];

function provenanceChecks(credit: CreditInput, ctx: EngineContext): Finding[] {
  const findings: Finding[] = [];
  for (const { key, label } of REQUIRED_FIELDS) {
    const value = credit[key];
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      findings.push({
        checkType: 'provenance',
        severity: 'warning',
        message: `Missing or empty ${label}`,
        details: { creditId: credit.id, field: String(key) },
      });
    }
  }
  const refYear = new Date(ctx.referenceTime).getUTCFullYear();
  if (!Number.isInteger(credit.vintage) || credit.vintage < 1900 || credit.vintage > refYear + 1) {
    findings.push({
      checkType: 'provenance',
      severity: 'warning',
      message: `Malformed vintage: ${String(credit.vintage)}`,
      details: { creditId: credit.id, vintage: credit.vintage },
    });
  }
  if (credit.serialStart > credit.serialEnd) {
    findings.push({
      checkType: 'provenance',
      severity: 'warning',
      message: `Malformed serial range: start ${credit.serialStart} > end ${credit.serialEnd}`,
      details: { creditId: credit.id, serialStart: credit.serialStart, serialEnd: credit.serialEnd },
    });
  }
  if (!(credit.quantityTco2e > 0)) {
    findings.push({
      checkType: 'provenance',
      severity: 'warning',
      message: `Non-positive quantity: ${String(credit.quantityTco2e)} tCO2e`,
      details: { creditId: credit.id, quantityTco2e: credit.quantityTco2e },
    });
  }
  return findings;
}

function anomalyChecks(credit: CreditInput, ctx: EngineContext): Finding[] {
  const findings: Finding[] = [];
  const refYear = new Date(ctx.referenceTime).getUTCFullYear();
  if (Number.isInteger(credit.vintage) && credit.vintage > refYear) {
    findings.push({
      checkType: 'anomaly',
      severity: 'warning',
      message: `Future vintage ${credit.vintage} (reference time is ${ctx.referenceTime})`,
      details: { creditId: credit.id, vintage: credit.vintage, referenceTime: ctx.referenceTime },
    });
  }
  const capacity = ctx.capacities[credit.projectId];
  if (capacity !== undefined && credit.quantityTco2e > capacity) {
    findings.push({
      checkType: 'anomaly',
      severity: 'critical',
      message: `Claimed quantity ${credit.quantityTco2e} tCO2e exceeds project capacity ${capacity} tCO2e`,
      details: {
        creditId: credit.id,
        projectId: credit.projectId,
        quantityTco2e: credit.quantityTco2e,
        capacityTco2e: capacity,
      },
    });
  }
  if (credit.status === 'retired' && !(ctx.anchoredCreditIds ?? new Set()).has(credit.id)) {
    findings.push({
      checkType: 'anomaly',
      severity: 'critical',
      message: 'Credit is marked retired but has no on-chain anchor receipt',
      details: { creditId: credit.id, status: credit.status },
    });
  }
  return findings;
}

export function verifyCredit(credit: CreditInput, ctx: EngineContext): VerificationResult {
  const findings: Finding[] = [
    ...duplicateChecks(credit, ctx),
    ...provenanceChecks(credit, ctx),
    ...anomalyChecks(credit, ctx),
  ];
  // Deterministic order: sort by canonical JSON so repeat runs are byte-identical.
  findings.sort((a, b) => {
    const sa = JSON.stringify(canonicalize(a));
    const sb = JSON.stringify(canonicalize(b));
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });

  let verdict: Verdict = 'VERIFIED';
  if (findings.some((f) => f.severity === 'critical')) verdict = 'REJECTED';
  else if (findings.some((f) => f.severity === 'warning')) verdict = 'NEEDS_REVIEW';

  return { verdict, findings, findingsHash: hashFindings(findings) };
}
