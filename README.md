# CarbonLens

Carbon-credit verification and emissions-transparency dashboard — entry for the
**IEEE ClimateChain Global Hackathon 2026** (track: Carbon Markets & Emissions Transparency).

**Status: scaffold only.** Spec approved pending — see `spec/` (GRILL → SPEC → DESIGN → TASKS).
No feature code yet, per the approval gate.

## What it will do

Ingest carbon-credit records → verify them deterministically (double-count detection,
provenance checks, anomaly flags) → anchor verification hashes to a smart contract on
Polygon Amoy testnet → explain results in plain English via LLM. Full plan in `spec/`.

## Layout

- `client/` — React + TypeScript + Vite + Tailwind (deploys to Vercel)
- `server/` — Node + TypeScript + Express (deploys to Render)
- `contracts/` — Solidity + Hardhat → Polygon Amoy (lands in slice 2)
- `fixtures/` — versioned seed data with a documented contract
- `spec/` — GRILL.md, research.md, SPEC.md, DESIGN.md, TASKS.md

## Local setup (scaffold)

```bash
# server
cd server && npm install --no-bin-links --ignore-scripts && npm run dev  # :4000

# client
cd client && npm install --no-bin-links --ignore-scripts && npm run dev    # :5173
```

Postgres 14+ expected at `DATABASE_URL` once slice 1 lands.

## Event

https://ieee-climatechain-hack.devpost.com/ — submission deadline Oct 25, 2026, 7:30 PM IST.
