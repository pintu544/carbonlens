# DESIGN — CarbonLens

> Architecture and contracts. Written after SPEC.md stabilized (2026-10-08).

## Architecture

Browser (React + Vite + Tailwind, hosted on Vercel) talks REST to an Express API (Node + TypeScript, hosted on Render). The API owns three internal modules: a deterministic verification engine (pure TypeScript, no I/O), a chain service (ethers v6 → Polygon Amoy RPC → CarbonLensRegistry contract, async with retry queue), and an LLM service (FastRouter key → explanations and insights). PostgreSQL (Render) persists credits, findings, verifications, and anchor receipts. Fixtures seed the DB idempotently at startup. In words: UI → API → {engine | chain service | LLM service} → Postgres; the chain is a write-only trust anchor, never in the read path.

## Data Model

- **Credit** — `id` (stable, e.g. `CR-2026-001`), `registry` (e.g. `VCS-FIXTURE`), `projectId`, `projectName`, `vintage` (year), `serialStart`, `serialEnd`, `quantityTco2e`, `methodology`, `standard`, `proponent`, `sourceDocHash` (sha256 of source doc), `status`: `draft | verified | anchored | retired`, `createdAt`. Unique: `id`; unique index on `sourceDocHash`.
- **Finding** — `id`, `creditId` → Credit, `checkType`: `duplicate | provenance | anomaly`, `severity`: `info | warning | critical`, `message`, `details` (JSON), `createdAt`.
- **Verification** — `id`, `creditId` → Credit (one active per credit; re-verification supersedes), `verdict`: `VERIFIED | NEEDS_REVIEW | REJECTED`, `findingsHash` (sha256 over canonical findings JSON), `engineVersion`, `createdAt`.
- **AnchorReceipt** — `creditIdHash` (bytes32 hex, PK), `txHash`, `blockNumber`, `network` (`amoy`), `verdict`, `createdAt`. One row per anchored credit, ever.
- **On-chain (CarbonLensRegistry.sol)** — `mapping(bytes32 => Record)` where `Record { bytes32 findingsHash; uint8 verdict; uint64 timestamp; bool retired; }`. `anchorVerification(creditIdHash, findingsHash, verdict)` reverts if already anchored. `retireCredit(creditIdHash)` reverts if unanchored or already retired. Events `Anchored` / `Retired` for AmoyScan visibility.

## API Contracts

- `GET /health` → `{ ok: true }`
- `GET /api/credits` → `[{ id, projectName, vintage, quantityTco2e, verdict, status }]` with `?verdict=&registry=&vintage=` filters
- `GET /api/credits/:id` → credit + findings[] + active verification + anchor receipt (or null)
- `POST /api/credits` → body: credit fields (minus computed) → `201 { id }`; validation errors → `400`
- `POST /api/credits/:id/verify` → runs engine → `200 { verdict, findings[] }` (supersedes prior verification)
- `POST /api/credits/:id/anchor` → queues/submits Amoy tx → `200 { txHash, amoyScanUrl }` or `202 { status: "pending" }`; already anchored → `409 { receipt }`
- `POST /api/credits/:id/retire` → on-chain retire → `200`; not anchored / already retired → `409`
- `POST /api/ai/explain` → body `{ verificationId }` → `{ explanation }` (LLM; `503` with fallback message if LLM down — verdicts unaffected)
- `GET /api/insights` → `{ summary, watchlist[] }` (LLM-generated, cached 1h)

## Key Decisions

- Decision: Polygon Amoy testnet for the contract — Rationale: free test MATIC, reliable faucet, AmoyScan gives judges clickable proof; EVM keeps the Solidity simple (rejected: mock ledger — fatal for credibility at a blockchain hackathon; mainnet — cost and risk for zero benefit; other L2s — weaker faucet/explorer story for demos).
- Decision: Deterministic engine decides, LLM only explains — Rationale: verdicts must be reproducible and auditable; an LLM in the decision path makes results unjudgeable (rejected: LLM-as-verifier).
- Decision: Synthetic fixtures modeled on Verra VCS schema as the primary dataset — Rationale: public registry endpoints exist but are unofficial/ToU-constrained and can't back a deterministic live demo; fixtures guarantee the 4 beats always play (rejected: live-scraping registries — fragile inside a 17-day solo build; marked as stretch).
- Decision: Minimal registry contract (~60 lines), all business logic off-chain — Rationale: the contract is a tamper-evident anchor, not a computer; keeps the first-Solidity-contract risk tiny (rejected: putting verification logic on-chain — gas, complexity, and audit surface for no demo benefit).
- Decision: Hardhat + ethers v6 — Rationale: standard, TypeScript-friendly, matches Pintu's stack (rejected: Foundry — excellent but a new toolchain for a one-contract job).
- Decision: Monorepo, Postgres on Render — Rationale: Pintu's proven deploy path (CivicLens/TasteRoute run the same shape); one repo for a solo sprint (rejected: Supabase/SQLite — unneeded novelty / deploy parity loss).

## Risks

1. **Amoy testnet flakiness / dry faucet.** RPC outages or no test MATIC would block anchoring demos. De-risked: fund the deployer wallet on day 1–2 (not demo eve); anchoring is async with retry and a visible pending state; verification works with zero chain access; demo video recorded with the chain live; AmoyScan links kept as backup. Never fake a tx hash.
2. **First Solidity contract (learning curve).** A subtle bug could eat days. De-risked: contract is ~60 lines with exactly two state-changing functions and on-chain guards; no OpenZeppelin needed; deploy to Amoy on day 2–3 — early enough to pivot to a simpler anchor shape if something fights back. No throwaway prototype needed: the real deploy IS the de-risking, scheduled early.
3. **17-day solo scope creep (especially AI).** "Just one more insight" kills demos. De-risked: AI locked to exactly two endpoints (GRILL Q10); three vertical slices each independently demoable — slice 1 alone is a submittable dashboard if later slices slip; hard stop on new features after day 12.
