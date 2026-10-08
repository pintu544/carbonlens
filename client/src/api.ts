const BASE = import.meta.env.VITE_API_URL ?? '';

export type Verdict = 'VERIFIED' | 'NEEDS_REVIEW' | 'REJECTED';

export interface CreditSummary {
  id: string;
  projectName: string;
  vintage: number;
  quantityTco2e: number;
  verdict: Verdict | null;
  status: string;
}

export interface Finding {
  id: number;
  check_type: 'duplicate' | 'provenance' | 'anomaly';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details: unknown;
}

export interface Verification {
  id: number;
  verdict: Verdict;
  findings_hash: string;
  engine_version: string;
  source: string;
  created_at: string;
}

export interface CreditDetail {
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
  status: string;
  createdAt: string;
}

export interface CreditDetailResponse {
  credit: CreditDetail;
  findings: Finding[];
  verification: Verification | null;
  anchorReceipt: AnchorReceipt | null;
  anchorJob: AnchorJobInfo | null;
  chain: ChainStatus;
}

export interface AnchorReceipt {
  creditIdHash: string;
  creditId: string;
  txHash: string;
  blockNumber: number | null;
  network: string;
  verdict: string;
  retired: boolean;
  retireTxHash: string | null;
  retireAmoyScanUrl: string | null;
  retiredAt: string | null;
  amoyScanUrl: string;
  createdAt: string;
}

export interface AnchorJobInfo {
  id: number;
  creditId: string;
  jobType: 'anchor' | 'retire';
  status: 'pending' | 'processing' | 'confirmed' | 'failed';
  attempts: number;
  lastError: string | null;
  txHash: string | null;
  amoyScanUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChainStatus {
  configured: boolean;
  network: string;
  contractAddress: string | null;
  amoyScanAddressUrl: string | null;
}

export interface Filters {
  verdict: string;
  registry: string;
  vintage: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export function fetchCredits(filters: Filters): Promise<CreditSummary[]> {
  const params = new URLSearchParams();
  if (filters.verdict) params.set('verdict', filters.verdict);
  if (filters.registry) params.set('registry', filters.registry);
  if (filters.vintage) params.set('vintage', filters.vintage);
  const qs = params.toString();
  return request<CreditSummary[]>(`/api/credits${qs ? `?${qs}` : ''}`);
}

export function fetchCredit(id: string): Promise<CreditDetailResponse> {
  return request<CreditDetailResponse>(`/api/credits/${encodeURIComponent(id)}`);
}

export function verifyCredit(id: string): Promise<{ verdict: Verdict; findings: Finding[] }> {
  return request(`/api/credits/${encodeURIComponent(id)}/verify`, { method: 'POST' });
}

export interface NewCredit {
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
}

export function createCredit(credit: NewCredit): Promise<{ id: string }> {
  return request<{ id: string }>('/api/credits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credit),
  });
}

/** Raw POST that surfaces non-2xx statuses (202 pending, 409 conflict) to the caller. */
async function postRaw(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

export function anchorCredit(id: string): Promise<{ status: number; body: any }> {
  return postRaw(`/api/credits/${encodeURIComponent(id)}/anchor`);
}

export function retireCredit(id: string): Promise<{ status: number; body: any }> {
  return postRaw(`/api/credits/${encodeURIComponent(id)}/retire`);
}
