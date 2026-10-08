# TASKS — CarbonLens

> Ordered checklist. One task = one verifiable unit (≤ half a day). Check off only when
> acceptance criteria pass. Slices are vertical: each ends demoable in the browser.

## Slice 1 — Verified credit ledger (data + engine + dashboard)

- [ ] T-1.1: Fixture dataset + fixture README
      Done means: `fixtures/carbon-credits.json` holds 24 credits across 6 fictional projects (Verra-VCS-shaped schema) including 3 planted double-count cases and 2 provenance gaps; `fixtures/README.md` documents the contract (fixed reference time `2026-10-01T00:00:00Z`, stable IDs `CR-2026-001`…, idempotent seed, refresh never overwrites user-added credits).
      Unblocks: T-1.2
- [ ] T-1.2: DB schema + idempotent seed script
      Done means: tables `credits`, `findings`, `verifications`, `anchor_receipts` migrate cleanly on local Postgres; `npm run seed` loads fixtures twice in a row with zero duplicates and preserves a hand-added credit.
      Unblocks: T-1.3, T-1.4
- [ ] T-1.3: Deterministic verification engine (pure TS) + unit tests
      Done means: `verifyCredit()` returns verdict + structured findings for duplicate (same ID hash / overlapping serials), provenance (missing/malformed fields), and anomaly (future vintage, volume-vs-capacity, retire-unanchored) checks; Vitest suite covers each check plus the 3 planted double-counts and 2 provenance gaps; same input → byte-identical findings hash on repeat runs.
      Unblocks: T-1.4
- [ ] T-1.4: Credits API (CRUD + verify)
      Done means: `GET /api/credits` (with verdict/registry/vintage filters), `GET /api/credits/:id` (credit + findings + verification), `POST /api/credits` (400 on bad input), `POST /api/credits/:id/verify` all respond as designed; verified with curl against local server.
      Unblocks: T-1.5
- [ ] T-1.5: Dashboard UI — list, filters, credit detail
      Done means: in the browser, the dashboard lists all 24 credits with verdict badges, filters narrow the list, and clicking a credit shows its findings; empty-DB state shows the seed call-to-action.
      Unblocks: T-1.6
- [ ] T-1.6: Deploy backend (Render) + frontend (Vercel), live smoke test
      Done means: production URLs serve the dashboard with seeded data; `/health` returns 200; no secrets in the repo (verified via `git log -p` grep for key names).
      Unblocks: slice 2 (demoable checkpoint: full verified ledger live)

## Slice 2 — On-chain anchoring (the blockchain story)

- [ ] T-2.1: CarbonLensRegistry.sol + Hardhat compile
      Done means: contract compiles; `anchorVerification` reverts on double-anchor, `retireCredit` reverts when unanchored/already-retired — proven by Hardhat local tests.
      Unblocks: T-2.2
- [ ] T-2.2: Fund deployer + deploy to Polygon Amoy + AmoyScan
      Done means: deployer wallet funded from the faucet; contract deployed to Amoy; address recorded in `.env.example` docs and DESIGN; contract visible and verified on AmoyScan.
      Unblocks: T-2.3
- [ ] T-2.3: Chain service (ethers v6) with async retry queue
      Done means: `anchorVerification` / `retireCredit` / read calls work against Amoy from a Node script; RPC failure → job retries with backoff and reports pending (no throw, no hang > 2s per attempt).
      Unblocks: T-2.4
- [ ] T-2.4: Anchor/retire API endpoints
      Done means: `POST /api/credits/:id/anchor` returns tx hash + AmoyScan URL (or 202 pending), and 409 with the existing receipt on double-anchor; `POST /api/credits/:id/retire` enforces the 409 guards; receipts persist in `anchor_receipts`.
      Unblocks: T-2.5
- [ ] T-2.5: UI anchoring flow (beats 3–4 of the demo)
      Done means: in the browser, clicking "Anchor verification" shows pending → confirmed with clickable AmoyScan link; attempting to anchor the same credit twice surfaces the rejection with the existing record; retiring flows the same way.
      Unblocks: slice 3 (demoable checkpoint: full 4-beat story minus AI)

## Slice 3 — AI insights + polish + submission prep

- [ ] T-3.1: `POST /api/ai/explain` via FastRouter
      Done means: given a verification ID, returns a plain-English explanation naming each finding and what would make the credit trustworthy; LLM outage → 503 with fallback message and verdicts untouched (verified by blocking the LLM host).
      Unblocks: T-3.3
- [ ] T-3.2: `GET /api/insights` trust summary (cached 1h)
      Done means: returns dashboard-level summary + watchlist; second call within the hour hits cache (no new LLM call).
      Unblocks: T-3.3
- [ ] T-3.3: UI polish + responsive + empty states
      Done means: explanations render inline on the credit page, insights panel on the dashboard; checked at 390px and 1440px with no horizontal overflow; before/after screenshots captured for visible changes.
      Unblocks: T-3.4
- [ ] T-3.4: Demo video script + recording (Pintu records)
      Done means: script follows the 4-beat plan (GRILL Q1) in 3–5 min; video uploaded (YouTube unlisted) and link verified playable.
      Unblocks: T-3.5
- [ ] T-3.5: Devpost submission draft prepared (NOT submitted)
      Done means: draft contains track alignment statement, problem/solution description, video link, public repo link, and the AmoyScan contract link; deadline re-verified on the Devpost page (7:30 PM IST Oct 25 confirmed 2026-10-08 — recheck day-before). Actual submission happens after Pintu's review, never by the agent alone.

## Stretch (only if slices 1–3 are done with days to spare)

- [ ] T-S1: Read-only Verra public project lookup (`registry.verra.org/uiapi/...`) for real project IDs, displayed with a "public registry data" disclaimer per Verra ToU. Done means: lookup works for 2+ real project IDs and never blocks the fixture demo path.
