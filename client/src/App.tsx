import { useCallback, useEffect, useState } from 'react';
import {
  fetchCredit,
  fetchCredits,
  verifyCredit,
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

function FiltersBar({
  filters,
  onChange,
  onClear,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClear: () => void;
}) {
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
          value={filters.vintage}
          onChange={(e) => onChange({ ...filters, vintage: e.target.value })}
          placeholder="e.g. 2024"
          inputMode="numeric"
          className="w-28 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
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

function CreditDetailView({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<CreditDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const load = useCallback(() => {
    setError(null);
    fetchCredit(id)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleVerify = () => {
    setVerifying(true);
    verifyCredit(id)
      .then(() => load())
      .catch((e: Error) => setError(e.message))
      .finally(() => setVerifying(false));
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
    </div>
  );
}

export default function App() {
  const [credits, setCredits] = useState<CreditSummary[]>([]);
  const [totals, setTotals] = useState({ VERIFIED: 0, NEEDS_REVIEW: 0, REJECTED: 0 });
  const [filters, setFilters] = useState<Filters>({ verdict: '', registry: '', vintage: '' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            <CreditDetailView id={selectedId} onBack={() => setSelectedId(null)} />
          ) : (
            <>
              <FiltersBar
                filters={filters}
                onChange={setFilters}
                onClear={() => setFilters({ verdict: '', registry: '', vintage: '' })}
              />
              <div className="mt-4">
                {loading ? (
                  <p className="text-sm text-slate-400">Loading credits…</p>
                ) : error ? (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300">
                    Could not reach the API: {error}
                  </div>
                ) : credits.length === 0 ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-8 text-center">
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
