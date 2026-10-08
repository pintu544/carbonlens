# GRILL — CarbonLens

> Pre-build interrogation. 8–10 hard questions, answers locked before SPEC.md stabilizes.
> Rules: "to be decided" is not an answer — either decide it now or move it to Out of Scope.
> Nothing important stays ambiguous when implementation starts. (Grilled 2026-10-08.)

## Q1 — Completion evidence
<!-- The ONE demo/check that proves the build works. What will Pintu see or click? -->

**Answer:** The 4-beat demo, recorded as the 3–5 min video: (1) dashboard lists credits with trust verdicts; (2) open a flagged credit → deterministic findings + AI plain-English explanation; (3) click "Anchor verification" → transaction mines on Polygon Amoy → tx hash + AmoyScan link displayed; (4) attempt to anchor the same credit twice / retire an already-retired credit → system rejects with the existing on-chain record shown. If those four beats play end-to-end on the live deployment, the build works.

## Q2 — Stack and layout
<!-- Languages, frameworks, monorepo vs repos, where each piece lives. -->

**Answer:** Monorepo `pintu544/carbonlens`. `client/` — React + TypeScript + Vite + Tailwind (deploys to Vercel). `server/` — Node + TypeScript + Express (deploys to Render). `contracts/` — Solidity + Hardhat, deployed to Polygon Amoy testnet. `fixtures/` — versioned seed data with a documented contract. PostgreSQL on Render. One repo, because a solo dev should not juggle remotes during a 17-day hackathon.

## Q3 — Data and migration
<!-- Where data lives, schema strategy, seed data, what happens to existing data. -->

**Answer:** PostgreSQL holds credits, findings, verifications, anchor receipts. Seed = `fixtures/carbon-credits.json`: 24 credits across 6 fictional projects modeled on the Verra VCS schema, with 3 deliberately planted double-count cases and 2 provenance gaps so the demo has something to catch. Fixture contract: fixed reference time `2026-10-01T00:00:00Z`, stable IDs (`CR-2026-001`…), idempotent seed script, refresh never overwrites user-added credits (see `fixtures/README.md`). Real registries have public-but-unofficial endpoints (research.md); a read-only live registry lookup is a marked stretch goal, NOT in the slices — the demo runs on fixtures so it can never fail live.

## Q4 — Ports and infra
<!-- Local ports, services, env vars, deploy targets, secrets handling. -->

**Answer:** Local: client `5173`, server `4000`, Postgres `5432`. Env vars: `DATABASE_URL`, `AMOY_RPC_URL`, `DEPLOYER_PRIVATE_KEY` (testnet only — no real funds, ever), `CONTRACT_ADDRESS`, `LLM_API_KEY` (FastRouter, already in hand), `LLM_BASE_URL`, `LLM_MODEL`. Secrets via env vars only, never committed; `.env.example` documents every key. Deploys: Vercel (client), Render (server + Postgres), Polygon Amoy (contract).

## Q5 — The happy path
<!-- The single most important flow, end to end, in one paragraph. -->

**Answer:** A sustainability analyst at a company buying offsets opens the CarbonLens dashboard, sees 24 credits with trust verdicts, clicks a credit flagged NEEDS_REVIEW, reads the deterministic findings plus the AI's plain-English explanation of why it was flagged, clicks "Anchor verification," watches the transaction confirm on Polygon Amoy, and copies the AmoyScan proof link to attach to the procurement file. Total: under 3 minutes, no blockchain knowledge required.

## Q6 — Boundary cases
<!-- Inputs, states, and edges the build MUST handle — not maybe, must. -->

**Answer:** (1) Anchoring an already-anchored credit → HTTP 409 with the existing anchor receipt (off-chain guard AND on-chain revert). (2) Retiring a non-anchored or already-retired credit → 409. (3) Credit submitted with missing fields → verdict NEEDS_REVIEW with provenance findings, never a crash. (4) Amoy RPC unreachable → anchor job queues with retry; UI shows "anchor pending" with the payload hash — verification results remain fully usable. (5) LLM API down → explanations show an "unavailable" fallback; verdicts are unaffected because the engine is deterministic. (6) Empty database → dashboard shows a seeded-fixtures call-to-action, not a blank page.

## Q7 — Failure modes
<!-- What breaks, how it degrades, what the user sees when it does. -->

**Answer:** Chain liveness is the top risk: verification logic is 100% off-chain and deterministic, so the product works with zero chain access — the chain is the trust anchor, not the compute layer. Anchoring degrades to queued+retry with visible pending state. The demo video is recorded with the chain live; AmoyScan links go in the video description as backup. Faucet risk is handled by funding the deployer wallet on day 1–2. We never fake a transaction hash — a pending anchor is shown as pending, period.

## Q8 — Out of scope
<!-- What's explicitly deferred. If it's not decided, it goes here. -->

**Answer:** Real registry API integrations (stretch only); mainnet deployment; any token/coin economics; credit trading/marketplace; multi-user auth (single demo workspace); mobile app; IoT sensor ingestion; satellite-data verification; automated retirement against real registries.

## Q9 — Blockchain depth: real contract, hash-anchored, or mock?
<!-- Judges score "effective use of blockchain/smart contracts." This decision changes the build. -->

**Answer:** REAL minimal smart contract on Polygon Amoy. `CarbonLensRegistry.sol` (~60 lines): `anchorVerification(creditIdHash, findingsHash, verdict)`, `retireCredit(creditIdHash)`, with on-chain guards — a creditIdHash anchors once, retires only after anchoring and only once. Rationale: this is an "AI and BLOCKCHAIN" hackathon and Technical Execution explicitly scores smart-contract use; a mock ledger would be fatal with judges. De-risked by keeping ALL business logic off-chain (the contract is a tamper-evident registry, nothing more) and deploying on day 2–3 via Hardhat + ethers v6, both standard tooling.

## Q10 — What exactly does the AI do?
<!-- Unscoped AI becomes a chatbot. Lock it. -->

**Answer:** Exactly two endpoints, nothing more: (a) `POST /api/ai/explain` — plain-English explanation of a verification's findings ("why this credit was flagged, and what would make it trustworthy"); (b) `GET /api/insights` — dashboard-level trust summary ("3 of 24 credits need review; double-counting is the common issue"). Via the FastRouter LLM key. The LLM NEVER decides a verdict — verdicts come only from the deterministic engine, so results are reproducible and auditable. No chatbot, no free-form Q&A.
