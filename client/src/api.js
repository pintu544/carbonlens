const BASE = import.meta.env.VITE_API_URL ?? '';
async function request(path, init) {
    const res = await fetch(`${BASE}${path}`, init);
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `request failed: ${res.status}`);
    }
    return (await res.json());
}
export function fetchCredits(filters) {
    const params = new URLSearchParams();
    if (filters.verdict)
        params.set('verdict', filters.verdict);
    if (filters.registry)
        params.set('registry', filters.registry);
    if (filters.vintage)
        params.set('vintage', filters.vintage);
    const qs = params.toString();
    return request(`/api/credits${qs ? `?${qs}` : ''}`);
}
export function fetchCredit(id) {
    return request(`/api/credits/${encodeURIComponent(id)}`);
}
export function verifyCredit(id) {
    return request(`/api/credits/${encodeURIComponent(id)}/verify`, { method: 'POST' });
}
