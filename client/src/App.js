import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { fetchCredit, fetchCredits, verifyCredit, } from './api';
const VERDICT_STYLES = {
    VERIFIED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    NEEDS_REVIEW: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    REJECTED: 'bg-red-500/15 text-red-300 border-red-500/30',
};
const SEVERITY_STYLES = {
    critical: 'bg-red-500/15 text-red-300 border-red-500/30',
    warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
};
function VerdictBadge({ verdict }) {
    if (!verdict) {
        return (_jsx("span", { className: "inline-flex items-center rounded-full border border-slate-600/50 bg-slate-700/30 px-2.5 py-0.5 text-xs font-medium text-slate-400", children: "UNVERIFIED" }));
    }
    return (_jsx("span", { className: `inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${VERDICT_STYLES[verdict]}`, children: verdict }));
}
function FiltersBar({ filters, onChange, onClear, }) {
    return (_jsxs("div", { className: "flex flex-wrap items-end gap-3", children: [_jsxs("label", { className: "flex flex-col gap-1 text-xs text-slate-400", children: ["Verdict", _jsxs("select", { value: filters.verdict, onChange: (e) => onChange({ ...filters, verdict: e.target.value }), className: "rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100", children: [_jsx("option", { value: "", children: "All" }), _jsx("option", { value: "VERIFIED", children: "Verified" }), _jsx("option", { value: "NEEDS_REVIEW", children: "Needs review" }), _jsx("option", { value: "REJECTED", children: "Rejected" })] })] }), _jsxs("label", { className: "flex flex-col gap-1 text-xs text-slate-400", children: ["Registry", _jsxs("select", { value: filters.registry, onChange: (e) => onChange({ ...filters, registry: e.target.value }), className: "rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100", children: [_jsx("option", { value: "", children: "All" }), _jsx("option", { value: "VCS-FIXTURE", children: "VCS-FIXTURE" })] })] }), _jsxs("label", { className: "flex flex-col gap-1 text-xs text-slate-400", children: ["Vintage", _jsx("input", { value: filters.vintage, onChange: (e) => onChange({ ...filters, vintage: e.target.value }), placeholder: "e.g. 2024", inputMode: "numeric", className: "w-28 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" })] }), _jsx("button", { onClick: onClear, className: "rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800", children: "Clear" })] }));
}
function CreditDetailView({ id, onBack }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [verifying, setVerifying] = useState(false);
    const load = useCallback(() => {
        setError(null);
        fetchCredit(id)
            .then(setData)
            .catch((e) => setError(e.message));
    }, [id]);
    useEffect(() => {
        load();
    }, [load]);
    const handleVerify = () => {
        setVerifying(true);
        verifyCredit(id)
            .then(() => load())
            .catch((e) => setError(e.message))
            .finally(() => setVerifying(false));
    };
    if (error) {
        return (_jsxs("div", { className: "rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300", children: ["Failed to load credit: ", error, ' ', _jsx("button", { onClick: onBack, className: "ml-2 underline", children: "Back" })] }));
    }
    if (!data)
        return _jsx("p", { className: "text-sm text-slate-400", children: "Loading credit\u2026" });
    const { credit, findings, verification } = data;
    return (_jsxs("div", { children: [_jsx("button", { onClick: onBack, className: "mb-4 text-sm text-slate-400 hover:text-slate-200", children: "\u2190 Back to dashboard" }), _jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsx("h2", { className: "text-2xl font-bold tracking-tight", children: credit.id }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(VerdictBadge, { verdict: verification?.verdict ?? null }), _jsx("button", { onClick: handleVerify, disabled: verifying, className: "rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50", children: verifying ? 'Verifying…' : 'Re-run verification' })] })] }), _jsxs("p", { className: "mt-1 text-sm text-slate-400", children: [credit.projectName, " \u00B7 ", credit.registry, " \u00B7 Vintage ", credit.vintage] }), _jsxs("dl", { className: "mt-6 grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-5 text-sm sm:grid-cols-3", children: [[
                        ['Project ID', credit.projectId],
                        ['Methodology', credit.methodology || '—'],
                        ['Standard', credit.standard || '—'],
                        ['Proponent', credit.proponent || '—'],
                        ['Quantity', `${credit.quantityTco2e.toLocaleString()} tCO₂e`],
                        ['Serial range', `${credit.serialStart.toLocaleString()}–${credit.serialEnd.toLocaleString()}`],
                    ].map(([k, v]) => (_jsxs("div", { children: [_jsx("dt", { className: "text-xs text-slate-500", children: k }), _jsx("dd", { className: "mt-0.5 text-slate-200", children: v })] }, k))), _jsxs("div", { className: "col-span-2 sm:col-span-3", children: [_jsx("dt", { className: "text-xs text-slate-500", children: "Source document hash" }), _jsx("dd", { className: "mt-0.5 break-all font-mono text-xs text-slate-300", children: credit.sourceDocHash })] })] }), _jsxs("h3", { className: "mt-8 text-lg font-semibold", children: ["Findings ", verification && _jsxs("span", { className: "text-sm font-normal text-slate-500", children: ["(engine ", verification.engine_version, ")"] })] }), findings.length === 0 ? (_jsx("p", { className: "mt-2 text-sm text-slate-400", children: "No findings \u2014 every check passed." })) : (_jsx("ul", { className: "mt-3 space-y-2", children: findings.map((f) => (_jsxs("li", { className: "rounded-lg border border-slate-800 bg-slate-900/60 p-4", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("span", { className: `inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[f.severity]}`, children: f.severity }), _jsx("span", { className: "text-xs uppercase tracking-wide text-slate-500", children: f.check_type })] }), _jsx("p", { className: "mt-1.5 text-sm text-slate-200", children: f.message })] }, f.id))) })), verification && (_jsxs("p", { className: "mt-4 break-all font-mono text-xs text-slate-500", children: ["findings hash: ", verification.findings_hash] }))] }));
}
export default function App() {
    const [credits, setCredits] = useState([]);
    const [filters, setFilters] = useState({ verdict: '', registry: '', vintage: '' });
    const [selectedId, setSelectedId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const load = useCallback((f) => {
        setLoading(true);
        setError(null);
        fetchCredits(f)
            .then((data) => {
            setCredits(data);
            setLoading(false);
        })
            .catch((e) => {
            setError(e.message);
            setLoading(false);
        });
    }, []);
    useEffect(() => {
        load(filters);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, load]);
    const counts = {
        VERIFIED: credits.filter((c) => c.verdict === 'VERIFIED').length,
        NEEDS_REVIEW: credits.filter((c) => c.verdict === 'NEEDS_REVIEW').length,
        REJECTED: credits.filter((c) => c.verdict === 'REJECTED').length,
    };
    return (_jsx("div", { className: "min-h-screen bg-slate-950 text-slate-100", children: _jsxs("div", { className: "mx-auto max-w-6xl px-4 py-8 sm:px-6", children: [_jsxs("header", { className: "flex flex-wrap items-baseline justify-between gap-2", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "CarbonLens" }), _jsx("p", { className: "mt-1 text-sm text-slate-400", children: "Carbon-credit verification and emissions-transparency dashboard" })] }), _jsxs("div", { className: "flex gap-4 text-sm", children: [_jsxs("span", { className: "text-emerald-300", children: [counts.VERIFIED, " verified"] }), _jsxs("span", { className: "text-amber-300", children: [counts.NEEDS_REVIEW, " need review"] }), _jsxs("span", { className: "text-red-300", children: [counts.REJECTED, " rejected"] })] })] }), _jsx("div", { className: "mt-6", children: selectedId ? (_jsx(CreditDetailView, { id: selectedId, onBack: () => setSelectedId(null) })) : (_jsxs(_Fragment, { children: [_jsx(FiltersBar, { filters: filters, onChange: setFilters, onClear: () => setFilters({ verdict: '', registry: '', vintage: '' }) }), _jsx("div", { className: "mt-4", children: loading ? (_jsx("p", { className: "text-sm text-slate-400", children: "Loading credits\u2026" })) : error ? (_jsxs("div", { className: "rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300", children: ["Could not reach the API: ", error] })) : credits.length === 0 ? (_jsxs("div", { className: "rounded-lg border border-slate-800 bg-slate-900/60 p-8 text-center", children: [_jsx("p", { className: "text-sm text-slate-300", children: "No credits in the database yet." }), _jsxs("p", { className: "mt-2 text-sm text-slate-500", children: ["The server seeds demo fixtures automatically on boot \u2014 restart it with", ' ', _jsx("code", { className: "font-mono text-slate-400", children: "npm run dev" }), " (or run", ' ', _jsx("code", { className: "font-mono text-slate-400", children: "npm run seed" }), "), then", ' ', _jsx("button", { onClick: () => load(filters), className: "underline", children: "retry" }), "."] })] })) : (_jsx("ul", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3", children: credits.map((c) => (_jsx("li", { children: _jsxs("button", { onClick: () => setSelectedId(c.id), className: "block w-full rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-left hover:border-slate-600", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { className: "font-mono text-sm font-medium text-slate-200", children: c.id }), _jsx(VerdictBadge, { verdict: c.verdict })] }), _jsx("p", { className: "mt-1.5 truncate text-sm text-slate-400", children: c.projectName }), _jsxs("p", { className: "mt-1 text-xs text-slate-500", children: ["Vintage ", c.vintage, " \u00B7 ", c.quantityTco2e.toLocaleString(), " tCO\u2082e"] })] }) }, c.id))) })) })] })) })] }) }));
}
