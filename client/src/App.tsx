import { useCallback, useEffect, useRef, useState } from 'react';
import {
  anchorCredit,
  createCredit,
  fetchCredit,
  fetchCredits,
  retireCredit,
  verifyCredit,
  type AnchorJobInfo,
  type AnchorReceipt,
  type CreditDetailResponse,
  type CreditSummary,
  type Filters,
  type Verdict,
} from './api';

const VERDICT_STYLES: Record<string, string> = {
  VERIFIED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  NEEDS_REVIEW: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  REJECTED: 'bg-red-500/15 text-red-300 border-red-500/30',
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-300 border-red-500/30',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
};

function VerdictBadge({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-600/50 bg-slate-700/30 px-2.5 py-0.5 text-xs font-medium text-slate-400">
        UNVERIFIED
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${VERDICT_STYLES[verdict]}`}
    >
      {verdict}
    </span>
  );
}

const MIN_VINTAGE_YEAR = 1900;
const MAX_VINTAGE_YEAR = 2100;

function isValidVintageInput(v: string): boolean {
  return /^\d{4}$/.test(v) && Number(v) >= MIN_VINTAGE_YEAR && Number(v) <= MAX_VINTAGE_YEAR;
}

function FiltersBar({
  filters,
  onChange,
  onClear,
  resetKey,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClear: () => void;
  resetKey: number;
}) {
  // Free-text year input: only propagate valid-or-empty values to the parent
  // filter so an out-of-range year can never reach the API (server 400s it too).
  const [vintageInput, setVintageInput] = useState(filters.vintage);
  const [vintageHint, setVintageHint] = useState<string | null>(null);
  const lastPropagated = useRef(filters.vintage);

  useEffect(() => {
    // Keep the local input in sync when the parent resets (e.g. Clear).
    if (filters.vintage !== lastPropagated.current) {
      setVintageInput(filters.vintage);
      setVintageHint(null);
      lastPropagated.current = filters.vintage;
    }
  }, [filters.vintage]);

  useEffect(() => {
    // Explicit reset signal: Clear must also wipe an invalid (unpropagated)
    // local input, which the prop comparison above cannot detect.
    setVintageInput('');
    setVintageHint(null);
    lastPropagated.current = '';
  }, [resetKey]);

  const handleVintageChange = (v: string) => {
    setVintageInput(v);
    if (v === '') {
      setVintageHint(null);
      lastPropagated.current = '';
      onChange({ ...filters, vintage: '' });
    } else if (isValidVintageInput(v)) {
      setVintageHint(null);
      lastPropagated.current = v;
      onChange({ ...filters, vintage: v });
    } else {
      setVintageHint(`Enter a 4-digit year ${MIN_VINTAGE_YEAR}–${MAX_VINTAGE_YEAR}`);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Verdict
        <select
          value={filters.verdict}
          onChange={(e) => onChange({ ...filters, verdict: e.target.value })}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        >
          <option value="">All</option>
          <option value="VERIFIED">Verified</option>
          <option value="NEEDS_REVIEW">Needs review</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Registry
        <select
          value={filters.registry}
          onChange={(e) => onChange({ ...filters, registry: e.target.value })}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        >
          <option value="">All</option>
          <option value="VCS-FIXTURE">VCS-FIXTURE</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Vintage
        <input
          value={vintageInput}
          onChange={(e) => handleVintageChange(e.target.value)}
          placeholder="e.g. 2024"
          inputMode="numeric"
          aria-invalid={vintageHint !== null}
          className={`w-28 rounded-md border bg-slate-900 px-3 py-2 text-sm text-slate-100 ${
            vintageHint ? 'border-red-500/60' : 'border-slate-700'
          }`}
        />
        {vintageHint && <span className="text-xs text-red-300">{vintageHint}</span>}
      </label>
      <button
        onClick={onClear}
        className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
      >
        Clear
      </button>
    </div>
  );
}

function CreditDetailView({ id, onBack, onVerified }: { id: string; onBack: () => void; onVerified?: () => void }) {
  const [data, setData] = useState<CreditDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [anchoring, setAnchoring] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const [chainMsg, setChainMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchCredit(id)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // While an anchor/retire job is pending, poll until it confirms (NFR-2:
  // the UI never blocks on chain calls — it shows the pending state).
  const jobStatus = data?.anchorJob?.status;
  useEffect(() => {
    if (jobStatus === 'pending' || jobStatus === 'processing') {
      const t = setInterval(load, 5000);
      return () => clearInterval(t);
    }
  }, [jobStatus, load]);

  const handleVerify = () => {
    setVerifying(true);
    verifyCredit(id)
      .then(() => {
        load();
        onVerified?.();
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setVerifying(false));
  };

  const handleAnchor = async () => {
    setAnchoring(true);
    setChainMsg(null);
    try {
      const { status, body } = await anchorCredit(id);
      if (status === 202) {
        setChainMsg('Anchor submitted — waiting for the transaction to mine…');
      } else if (status === 409) {
        // FR-5: double-anchor rejected with the existing receipt.
        setChainMsg(body?.error ?? 'Credit is already anchored.');
      } else {
        setChainMsg(body?.error ?? `Anchor request failed (HTTP ${status}).`);
      }
    } catch (e) {
      setChainMsg(e instanceof Error ? e.message : 'Anchor request failed.');
    } finally {
      setAnchoring(false);
      load();
    }
  };

  const handleRetire = async () => {
    setRetiring(true);
    setChainMsg(null);
    try {
      const { status, body } = await retireCredit(id);
      if (status === 202) {
        setChainMsg('Retire submitted — waiting for the transaction to mine…');
      } else if (status === 409) {
        setChainMsg(body?.error ?? 'Cannot retire this credit.');
      } else {
        setChainMsg(body?.error ?? `Retire request failed (HTTP ${status}).`);
      }
    } catch (e) {
      setChainMsg(e instanceof Error ? e.message : 'Retire request failed.');
    } finally {
      setRetiring(false);
      load();
    }
  };

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300">
        Failed to load credit: {error}{' '}
        <button onClick={onBack} className="ml-2 underline">
          Back
        </button>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-slate-400">Loading credit…</p>;

  const { credit, findings, verification } = data;
  return (
    <div>
      <button onClick={onBack} className="mb-4 text-sm text-slate-400 hover:text-slate-200">
        ← Back to dashboard
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight">{credit.id}</h2>
        <div className="flex items-center gap-2">
          <VerdictBadge verdict={verification?.verdict ?? null} />
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            {verifying ? 'Verifying…' : 'Re-run verification'}
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        {credit.projectName} · {credit.registry} · Vintage {credit.vintage}
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-5 text-sm sm:grid-cols-3">
        {[
          ['Project ID', credit.projectId],
          ['Methodology', credit.methodology || '—'],
          ['Standard', credit.standard || '—'],
          ['Proponent', credit.proponent || '—'],
          ['Quantity', `${credit.quantityTco2e.toLocaleString()} tCO₂e`],
          ['Serial range', `${credit.serialStart.toLocaleString()}–${credit.serialEnd.toLocaleString()}`],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-slate-500">{k}</dt>
            <dd className="mt-0.5 text-slate-200">{v}</dd>
          </div>
        ))}
        <div className="col-span-2 sm:col-span-3">
          <dt className="text-xs text-slate-500">Source document hash</dt>
          <dd className="mt-0.5 break-all font-mono text-xs text-slate-300">{credit.sourceDocHash}</dd>
        </div>
      </dl>

      <h3 className="mt-8 text-lg font-semibold">
        Findings {verification && <span className="text-sm font-normal text-slate-500">(engine {verification.engine_version})</span>}
      </h3>
      {findings.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">No findings — every check passed.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {findings.map((f) => (
            <li key={f.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[f.severity]}`}
                >
                  {f.severity}
                </span>
                <span className="text-xs uppercase tracking-wide text-slate-500">{f.check_type}</span>
              </div>
              <p className="mt-1.5 text-sm text-slate-200">{f.message}</p>
            </li>
          ))}
        </ul>
      )}

      {verification && (
        <p className="mt-4 break-all font-mono text-xs text-slate-500">
          findings hash: {verification.findings_hash}
        </p>
      )}

      <AnchorSection
        receipt={data.anchorReceipt}
        job={data.anchorJob}
        chainConfigured={data.chain.configured}
        contractUrl={data.chain.amoyScanAddressUrl}
        anchoring={anchoring}
        retiring={retiring}
        chainMsg={chainMsg}
        onAnchor={handleAnchor}
        onRetire={handleRetire}
      />
    </div>
  );
}

function shortHash(h: string): string {
  return h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-8)}` : h;
}

function AnchorSection({
  receipt,
  job,
  chainConfigured,
  contractUrl,
  anchoring,
  retiring,
  chainMsg,
  onAnchor,
  onRetire,
}: {
  receipt: AnchorReceipt | null;
  job: AnchorJobInfo | null;
  chainConfigured: boolean;
  contractUrl: string | null;
  anchoring: boolean;
  retiring: boolean;
  chainMsg: string | null;
  onAnchor: () => void;
  onRetire: () => void;
}) {
  const jobActive = job && (job.status === 'pending' || job.status === 'processing');
  return (
    <section className="mt-8 rounded-lg border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">On-chain anchoring</h3>
        {contractUrl && (
          <a
            href={contractUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-sky-400 hover:text-sky-300"
          >
            CarbonLensRegistry contract ↗
          </a>
        )}
      </div>

      {!chainConfigured ? (
        <p className="mt-2 text-sm text-slate-500">
          On-chain anchoring is not configured on this server — verification works without it.
        </p>
      ) : receipt ? (
        <div className="mt-3 space-y-2 text-sm">
          <p>
            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
              ANCHORED
            </span>{' '}
            {receipt.retired && (
              <span className="inline-flex items-center rounded-full border border-slate-500/40 bg-slate-700/30 px-2.5 py-0.5 text-xs font-medium text-slate-300">
                RETIRED
              </span>
            )}
          </p>
          <p className="text-slate-400">
            Transaction{' '}
            <a
              href={receipt.amoyScanUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-sky-400 hover:text-sky-300"
              title={receipt.txHash}
            >
              {shortHash(receipt.txHash)} ↗
            </a>{' '}
            <span className="text-slate-500">
              (block {receipt.blockNumber ?? '—'} · {receipt.network})
            </span>
          </p>
          {receipt.retired ? (
            <p className="text-slate-400">
              Retired{' '}
              {receipt.retireAmoyScanUrl ? (
                <a
                  href={receipt.retireAmoyScanUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-sky-400 hover:text-sky-300"
                  title={receipt.retireTxHash ?? ''}
                >
                  {shortHash(receipt.retireTxHash ?? '')} ↗
                </a>
              ) : (
                <span className="text-slate-500">(retire tx recorded off-chain)</span>
              )}
            </p>
          ) : (
            <button
              onClick={onRetire}
              disabled={retiring || Boolean(jobActive)}
              className="rounded-md border border-amber-500/40 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
            >
              {retiring ? 'Submitting retire…' : 'Retire credit'}
            </button>
          )}
        </div>
      ) : jobActive ? (
        <div className="mt-3 text-sm">
          <p className="text-amber-300">
            {job.jobType === 'retire' ? 'Retire' : 'Anchor'} {job.status}…
            <span className="ml-2 text-slate-500">(attempt {job.attempts})</span>
          </p>
          {job.txHash ? (
            <p className="mt-1 text-slate-400">
              Transaction submitted — waiting for it to mine:{' '}
              <span className="font-mono text-xs" title={job.txHash}>
                {shortHash(job.txHash)}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-slate-500">Queued — the worker will submit it shortly.</p>
          )}
          {job.lastError && (
            <p className="mt-1 text-xs text-red-300/80">Last attempt: {job.lastError}</p>
          )}
        </div>
      ) : (
        <div className="mt-3">
          {job?.status === 'failed' && (
            <p className="mt-1 text-xs text-red-300/80">
              Last {job.jobType} failed: {job.lastError ?? 'unknown error'} — you can retry below.
            </p>
          )}
          {job?.status === 'failed' && job.jobType === 'retire' ? (
            <button
              onClick={onRetire}
              disabled={retiring}
              className="rounded-md border border-amber-500/40 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
            >
              {retiring ? 'Submitting retire…' : 'Retry retire'}
            </button>
          ) : (
            <button
              onClick={onAnchor}
              disabled={anchoring}
              className="rounded-md border border-sky-500/40 px-3 py-1.5 text-sm text-sky-300 hover:bg-sky-500/10 disabled:opacity-50"
            >
              {anchoring ? 'Submitting…' : 'Anchor verification'}
            </button>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Anchors this verification to the CarbonLensRegistry contract on Polygon Amoy.
          </p>
        </div>
      )}

      {chainMsg && <p className="mt-3 text-sm text-slate-300">{chainMsg}</p>}
    </section>
  );
}

const EMPTY_CREDIT_FORM = {
  id: '',
  registry: 'VCS-FIXTURE',
  projectId: '',
  projectName: '',
  vintage: '',
  serialStart: '',
  serialEnd: '',
  quantityTco2e: '',
  methodology: '',
  standard: '',
  proponent: '',
  sourceDocHash: '',
};

function TextField({
  label,
  value,
  onChange,
  error,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  inputMode?: 'numeric' | 'decimal' | 'text';
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className={`rounded-md border bg-slate-900 px-3 py-2 text-sm text-slate-100 ${
          error ? 'border-red-500/60' : 'border-slate-700'
        }`}
      />
      {error && <span className="text-xs text-red-300">{error}</span>}
    </label>
  );
}

function validateCreditForm(f: typeof EMPTY_CREDIT_FORM): Record<string, string> {
  const e: Record<string, string> = {};
  for (const k of ['id', 'registry', 'projectId', 'projectName'] as const) {
    if (!f[k].trim()) e[k] = 'Required';
  }
  if (!isValidVintageInput(f.vintage)) {
    e.vintage = `Enter a 4-digit year ${MIN_VINTAGE_YEAR}–${MAX_VINTAGE_YEAR}`;
  }
  if (!/^\d+$/.test(f.serialStart)) e.serialStart = 'Enter a whole number';
  if (!/^\d+$/.test(f.serialEnd)) e.serialEnd = 'Enter a whole number';
  if (
    /^\d+$/.test(f.serialStart) &&
    /^\d+$/.test(f.serialEnd) &&
    Number(f.serialEnd) < Number(f.serialStart)
  ) {
    e.serialEnd = 'Must be ≥ serial start';
  }
  const q = Number(f.quantityTco2e);
  if (f.quantityTco2e.trim() === '' || Number.isNaN(q) || q <= 0) {
    e.quantityTco2e = 'Enter a quantity greater than 0';
  }
  return e;
}

async function hashSourceDoc(canonical: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Manual credit entry (SPEC FR-1). Small, visually consistent with the dashboard.
function AddCreditForm({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState(EMPTY_CREDIT_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set =
    (k: keyof typeof EMPTY_CREDIT_FORM) =>
    (v: string): void => {
      setForm((f) => ({ ...f, [k]: v }));
      setFieldErrors((errs) => {
        const next = { ...errs };
        delete next[k];
        return next;
      });
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateCreditForm(form);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSubmitting(true);
    setServerError(null);
    try {
      let sourceDocHash = form.sourceDocHash.trim();
      if (!sourceDocHash) {
        // Deterministic fallback: same fields → same hash, reproducible.
        sourceDocHash = await hashSourceDoc(
          JSON.stringify([
            form.id.trim(),
            form.registry.trim(),
            form.projectId.trim(),
            Number(form.vintage),
            Number(form.serialStart),
            Number(form.serialEnd),
            Number(form.quantityTco2e),
          ])
        );
      }
      await createCredit({
        id: form.id.trim(),
        registry: form.registry.trim(),
        projectId: form.projectId.trim(),
        projectName: form.projectName.trim(),
        vintage: Number(form.vintage),
        serialStart: Number(form.serialStart),
        serialEnd: Number(form.serialEnd),
        quantityTco2e: Number(form.quantityTco2e),
        methodology: form.methodology.trim(),
        standard: form.standard.trim(),
        proponent: form.proponent.trim(),
        sourceDocHash,
      });
      setForm(EMPTY_CREDIT_FORM);
      onAdded();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to create credit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-5"
    >
      <h2 className="text-lg font-semibold">Add credit</h2>
      <p className="mt-1 text-xs text-slate-500">
        Manual entry (SPEC FR-1). The credit is created as a draft — open its detail view to run
        verification.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TextField label="Credit ID" value={form.id} onChange={set('id')} error={fieldErrors.id} placeholder="CR-2026-025" />
        <TextField label="Registry" value={form.registry} onChange={set('registry')} error={fieldErrors.registry} />
        <TextField label="Project ID" value={form.projectId} onChange={set('projectId')} error={fieldErrors.projectId} placeholder="VCS-4821" />
        <TextField label="Project name" value={form.projectName} onChange={set('projectName')} error={fieldErrors.projectName} />
        <TextField label="Vintage" value={form.vintage} onChange={set('vintage')} error={fieldErrors.vintage} placeholder="2024" inputMode="numeric" />
        <TextField label="Serial start" value={form.serialStart} onChange={set('serialStart')} error={fieldErrors.serialStart} inputMode="numeric" />
        <TextField label="Serial end" value={form.serialEnd} onChange={set('serialEnd')} error={fieldErrors.serialEnd} inputMode="numeric" />
        <TextField label="Quantity (tCO₂e)" value={form.quantityTco2e} onChange={set('quantityTco2e')} error={fieldErrors.quantityTco2e} inputMode="decimal" />
        <TextField label="Methodology" value={form.methodology} onChange={set('methodology')} placeholder="VM0042" />
        <TextField label="Standard" value={form.standard} onChange={set('standard')} placeholder="VCS v4.5" />
        <TextField label="Proponent" value={form.proponent} onChange={set('proponent')} />
        <TextField
          label="Source doc hash"
          value={form.sourceDocHash}
          onChange={set('sourceDocHash')}
          placeholder="sha256 — blank = auto-generated"
        />
      </div>
      {serverError && (
        <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {serverError}
        </p>
      )}
      <div className="mt-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {submitting ? 'Adding…' : 'Add credit'}
        </button>
      </div>
    </form>
  );
}

export default function App() {
  const [credits, setCredits] = useState<CreditSummary[]>([]);
  const [totals, setTotals] = useState({ VERIFIED: 0, NEEDS_REVIEW: 0, REJECTED: 0 });
  const [filters, setFilters] = useState<Filters>({ verdict: '', registry: '', vintage: '' });
  const [filterResetKey, setFilterResetKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Header totals always reflect the full ledger, not the active filters.
  const loadTotals = useCallback(() => {
    fetchCredits({ verdict: '', registry: '', vintage: '' })
      .then((all) => {
        setTotals({
          VERIFIED: all.filter((c) => c.verdict === 'VERIFIED').length,
          NEEDS_REVIEW: all.filter((c) => c.verdict === 'NEEDS_REVIEW').length,
          REJECTED: all.filter((c) => c.verdict === 'REJECTED').length,
        });
      })
      .catch(() => {});
  }, []);

  const load = useCallback((f: Filters) => {
    setLoading(true);
    setError(null);
    fetchCredits(f)
      .then((data) => {
        setCredits(data);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, load]);

  useEffect(() => {
    loadTotals();
  }, [loadTotals]);

  const counts = totals;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">CarbonLens</h1>
            <p className="mt-1 text-sm text-slate-400">
              Carbon-credit verification and emissions-transparency dashboard
            </p>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-emerald-300">{counts.VERIFIED} verified</span>
            <span className="text-amber-300">{counts.NEEDS_REVIEW} need review</span>
            <span className="text-red-300">{counts.REJECTED} rejected</span>
          </div>
        </header>

        <div className="mt-6">
          {selectedId ? (
            <CreditDetailView id={selectedId} onBack={() => setSelectedId(null)} onVerified={loadTotals} />
          ) : (
            <>
              <div className="flex justify-end">
                <button
                  onClick={() => setShowForm((s) => !s)}
                  className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
                >
                  {showForm ? 'Close form' : '+ Add credit'}
                </button>
              </div>
              {showForm && (
                <AddCreditForm
                  onAdded={() => {
                    setShowForm(false);
                    load(filters);
                    loadTotals();
                  }}
                />
              )}
              <div className="mt-4">
                <FiltersBar
                  filters={filters}
                  onChange={setFilters}
                  onClear={() => {
                    setFilters({ verdict: '', registry: '', vintage: '' });
                    setFilterResetKey((k) => k + 1);
                  }}
                  resetKey={filterResetKey}
                />
              </div>
              <div className="mt-4">
                {loading ? (
                  <p className="text-sm text-slate-400">Loading credits…</p>
                ) : error ? (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300">
                    Could not reach the API: {error}
                  </div>
                ) : credits.length === 0 ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-8 text-center">
                    {filters.verdict || filters.registry || filters.vintage ? (
                      <>
                        <p className="text-sm text-slate-300">No credits match the current filters.</p>
                        <p className="mt-2 text-sm text-slate-500">
                          <button
                            onClick={() => setFilters({ verdict: '', registry: '', vintage: '' })}
                            className="underline"
                          >
                            Clear filters
                          </button>{' '}
                          to see all credits.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-slate-300">No credits in the database yet.</p>
                        <p className="mt-2 text-sm text-slate-500">
                          The server seeds demo fixtures automatically on boot — restart it with{' '}
                          <code className="font-mono text-slate-400">npm run dev</code> (or run{' '}
                          <code className="font-mono text-slate-400">npm run seed</code>), then{' '}
                          <button onClick={() => load(filters)} className="underline">
                            retry
                          </button>
                          .
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {credits.map((c) => (
                      <li key={c.id}>
                        <button
                          onClick={() => setSelectedId(c.id)}
                          className="block w-full rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-left hover:border-slate-600"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-sm font-medium text-slate-200">{c.id}</span>
                            <VerdictBadge verdict={c.verdict} />
                          </div>
                          <p className="mt-1.5 truncate text-sm text-slate-400">{c.projectName}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Vintage {c.vintage} · {c.quantityTco2e.toLocaleString()} tCO₂e
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
