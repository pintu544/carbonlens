import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  verifyCredit,
  type CreditInput,
  type EngineContext,
} from './engine.js';

const here = dirname(fileURLToPath(import.meta.url));

function loadFixtureCredits(): CreditInput[] {
  const raw = readFileSync(join(here, '..', '..', 'fixtures', 'carbon-credits.json'), 'utf8');
  const data = JSON.parse(raw) as {
    credits: CreditInput[];
    projects: Array<{ projectId: string; capacityTco2e: number }>;
    meta: { referenceTime: string };
  };
  return data.credits;
}

function loadCapacities(): Record<string, number> {
  const raw = readFileSync(join(here, '..', '..', 'fixtures', 'carbon-credits.json'), 'utf8');
  const data = JSON.parse(raw) as {
    projects: Array<{ projectId: string; capacityTco2e: number }>;
  };
  return Object.fromEntries(data.projects.map((p) => [p.projectId, p.capacityTco2e]));
}

const REFERENCE_TIME = '2026-10-01T00:00:00Z';

const baseCredit: CreditInput = {
  id: 'CR-TEST-001',
  registry: 'VCS-FIXTURE',
  projectId: 'VCS-4821',
  projectName: 'Test Project',
  vintage: 2024,
  serialStart: 1,
  serialEnd: 12500,
  quantityTco2e: 12500,
  methodology: 'VM0042',
  standard: 'VCS v4.5',
  proponent: 'Test Ltd',
  sourceDocHash: 'aaaabbbbcccc',
};

function ctxWith(credits: CreditInput[], extra: Partial<EngineContext> = {}): EngineContext {
  return {
    credits,
    capacities: { 'VCS-4821': 60000 },
    referenceTime: REFERENCE_TIME,
    ...extra,
  };
}

describe('duplicate checks', () => {
  it('flags identical serial ranges claimed twice as critical', () => {
    const other = { ...baseCredit, id: 'CR-TEST-002', sourceDocHash: 'dddd' };
    const res = verifyCredit(baseCredit, ctxWith([baseCredit, other]));
    expect(res.verdict).toBe('REJECTED');
    expect(res.findings.some((f) => f.checkType === 'duplicate' && f.severity === 'critical')).toBe(true);
  });

  it('flags the same source document hash under two credit IDs', () => {
    const other = { ...baseCredit, id: 'CR-TEST-002', serialStart: 20001, serialEnd: 32500 };
    const res = verifyCredit(baseCredit, ctxWith([baseCredit, other]));
    expect(res.verdict).toBe('REJECTED');
    expect(
      res.findings.some((f) => f.checkType === 'duplicate' && f.message.includes('Source document hash'))
    ).toBe(true);
  });

  it('flags partially overlapping serial ranges', () => {
    const other = { ...baseCredit, id: 'CR-TEST-002', serialStart: 6251, serialEnd: 18750, sourceDocHash: 'dddd' };
    const res = verifyCredit(baseCredit, ctxWith([baseCredit, other]));
    expect(res.verdict).toBe('REJECTED');
  });

  it('passes non-overlapping serials with distinct document hashes', () => {
    const other = { ...baseCredit, id: 'CR-TEST-002', serialStart: 12501, serialEnd: 25000, sourceDocHash: 'dddd' };
    const res = verifyCredit(baseCredit, ctxWith([baseCredit, other]));
    expect(res.verdict).toBe('VERIFIED');
    expect(res.findings).toHaveLength(0);
  });
});

describe('provenance checks', () => {
  it('flags a missing methodology as a warning (NEEDS_REVIEW)', () => {
    const res = verifyCredit({ ...baseCredit, methodology: '' }, ctxWith([baseCredit]));
    expect(res.verdict).toBe('NEEDS_REVIEW');
    expect(res.findings.some((f) => f.checkType === 'provenance' && f.details.field === 'methodology')).toBe(true);
  });

  it('flags a missing proponent', () => {
    const res = verifyCredit({ ...baseCredit, proponent: '  ' }, ctxWith([baseCredit]));
    expect(res.verdict).toBe('NEEDS_REVIEW');
  });

  it('flags a malformed vintage', () => {
    const res = verifyCredit({ ...baseCredit, vintage: 99 }, ctxWith([baseCredit]));
    expect(res.findings.some((f) => f.checkType === 'provenance' && f.message.includes('Malformed vintage'))).toBe(true);
  });

  it('flags an inverted serial range', () => {
    const res = verifyCredit({ ...baseCredit, serialStart: 500, serialEnd: 100 }, ctxWith([baseCredit]));
    expect(res.findings.some((f) => f.message.includes('Malformed serial range'))).toBe(true);
  });

  it('flags a non-positive quantity', () => {
    const res = verifyCredit({ ...baseCredit, quantityTco2e: 0 }, ctxWith([baseCredit]));
    expect(res.findings.some((f) => f.message.includes('Non-positive quantity'))).toBe(true);
  });
});

describe('anomaly checks', () => {
  it('flags a future vintage against the reference time', () => {
    const res = verifyCredit({ ...baseCredit, vintage: 2027 }, ctxWith([baseCredit]));
    expect(res.verdict).toBe('NEEDS_REVIEW');
    expect(res.findings.some((f) => f.checkType === 'anomaly' && f.message.includes('Future vintage'))).toBe(true);
  });

  it('rejects a claim exceeding project capacity', () => {
    const res = verifyCredit({ ...baseCredit, quantityTco2e: 400000 }, ctxWith([baseCredit]));
    expect(res.verdict).toBe('REJECTED');
    expect(res.findings.some((f) => f.severity === 'critical' && f.message.includes('exceeds project capacity'))).toBe(
      true
    );
  });

  it('flags a retired-but-unanchored credit', () => {
    const res = verifyCredit({ ...baseCredit, status: 'retired' }, ctxWith([baseCredit], { anchoredCreditIds: new Set() }));
    expect(res.verdict).toBe('REJECTED');
    expect(res.findings.some((f) => f.message.includes('no on-chain anchor'))).toBe(true);
  });

  it('does not flag a retired-and-anchored credit', () => {
    const res = verifyCredit(
      { ...baseCredit, status: 'retired' },
      ctxWith([baseCredit], { anchoredCreditIds: new Set(['CR-TEST-001']) })
    );
    expect(res.verdict).toBe('VERIFIED');
  });
});

describe('planted fixture cases', () => {
  const credits = loadFixtureCredits();
  const capacities = loadCapacities();
  const ctx: EngineContext = { credits, capacities, referenceTime: REFERENCE_TIME };
  const byId = Object.fromEntries(credits.map((c) => [c.id, c]));

  const verdictOf = (id: string) => verifyCredit(byId[id], ctx).verdict;

  it('rejects all three planted double-count cases', () => {
    for (const id of ['CR-2026-003', 'CR-2026-004', 'CR-2026-009', 'CR-2026-010', 'CR-2026-015', 'CR-2026-016']) {
      const res = verifyCredit(byId[id], ctx);
      expect(res.verdict).toBe('REJECTED');
      expect(res.findings.some((f) => f.checkType === 'duplicate' && f.severity === 'critical')).toBe(true);
    }
  });

  it('marks both planted provenance gaps as NEEDS_REVIEW', () => {
    for (const id of ['CR-2026-002', 'CR-2026-014']) {
      const res = verifyCredit(byId[id], ctx);
      expect(res.verdict).toBe('NEEDS_REVIEW');
      expect(res.findings.some((f) => f.checkType === 'provenance')).toBe(true);
    }
    expect(verdictOf('CR-2026-001')).toBe('VERIFIED');
  });

  it('flags the future-vintage and over-capacity anomalies', () => {
    expect(verdictOf('CR-2026-006')).toBe('NEEDS_REVIEW');
    expect(verdictOf('CR-2026-013')).toBe('REJECTED');
  });
});

describe('determinism', () => {
  it('returns byte-identical findings hashes on repeat runs', () => {
    const credits = loadFixtureCredits();
    const ctx: EngineContext = { credits, capacities: loadCapacities(), referenceTime: REFERENCE_TIME };
    for (const credit of credits) {
      const a = verifyCredit(credit, ctx);
      const b = verifyCredit(credit, ctx);
      expect(a.findingsHash).toBe(b.findingsHash);
      expect(a.verdict).toBe(b.verdict);
    }
  });
});
