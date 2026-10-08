# SPEC — CarbonLens

> Requirements. Testable, implementation-free. One page. (Stabilized 2026-10-08.)

## Problem

Voluntary carbon markets run on trust, but buyers can't verify what they buy: the same credit can be counted twice, provenance documents are hard to check, and verification reports are written for auditors, not buyers. High-profile phantom-credit scandals have cratered buyer confidence at the exact moment companies need offsets to meet net-zero pledges. CarbonLens makes every credit checkable: deterministic verification anyone can read, anchored to a public blockchain anyone can audit, explained in plain English.

## Users

- **Sustainability analyst** at a company buying offsets — reviews credits, inspects flags, anchors proof for procurement files.
- **Hackathon judge** — needs the 4-beat story (dashboard → findings → on-chain anchor → double-count rejection) in under 5 minutes.

## Functional Requirements

- FR-1: The system SHALL ingest carbon-credit records from the versioned fixture dataset and via a manual entry form.
- FR-2: The system SHALL run deterministic verification checks on every credit: duplicate detection (same ID hash / overlapping serial ranges claimed twice), provenance completeness (registry, project ID, vintage, methodology, standard present and well-formed), and anomaly flags (future vintage, issuance vs. capacity outliers, retirement of unanchored credit).
- FR-3: The system SHALL assign each credit a verdict — VERIFIED, NEEDS_REVIEW, or REJECTED — with structured, inspectable findings. Verdicts SHALL be reproducible: same input → same verdict, with no LLM in the decision path.
- FR-4: The system SHALL anchor a verification record (credit ID hash + findings hash + verdict) to the CarbonLensRegistry smart contract on Polygon Amoy and display the transaction hash with an AmoyScan link.
- FR-5: The system SHALL reject anchoring a credit whose ID hash is already anchored (HTTP 409), surfacing the existing anchor receipt — enforced off-chain before submission AND on-chain by the contract.
- FR-6: The system SHALL generate a plain-English AI explanation for a verification's findings on demand.
- FR-7: The system SHALL display a dashboard listing all credits with verdicts, filters (verdict, registry, vintage), a credit detail view, and a trust-summary panel with AI insights.
- FR-8: The system SHALL allow retiring an anchored credit exactly once; retiring a non-anchored or already-retired credit SHALL be rejected (HTTP 409).
- FR-9: The system SHALL persist credits, findings, verifications, and anchor receipts in PostgreSQL.

## Non-Functional Requirements

- NFR-1: Performance — verifying all 24 fixture credits completes in < 5s end-to-end (off-chain); API reads p95 < 500ms; dashboard first paint < 2s on broadband.
- NFR-2: Reliability — Amoy anchoring is async with retry; the UI never blocks > 2s on chain calls (shows pending state); verification works with zero chain access.
- NFR-3: Security — private keys, RPC URLs, and LLM keys via env vars only, never committed; testnet key only (no real funds, ever).
- NFR-4: Honesty — transaction hashes are shown only for mined transactions; pending anchors are labeled pending. Nothing is faked for the demo.

## Out of Scope

Real registry API integrations (marked stretch); mainnet deployment; token/coin economics; credit trading or marketplace; multi-user auth; mobile app; IoT sensor ingestion; satellite-data verification; automated retirement against real registries.

## Judging Criteria (hackathons only)

- **Climate Impact** → FR-1, FR-2, FR-3, FR-7: transparency tooling offset buyers can actually use against double counting.
- **Innovation & Creativity** → deterministic verification + on-chain anchoring + AI explanations as one loop; a novel combination versus pure registries or pure dashboards.
- **Technical Execution** → FR-4, FR-5, FR-8: a real smart contract on testnet doing real double-count prevention, plus a deterministic engine with tests.
- **Practical Usefulness** → FR-7, manual entry (FR-1), exportable AmoyScan proof links; realistic for procurement teams.
- **Presentation & Communication** → the 4-beat demo video (GRILL Q1/Q10-video plan); dashboard readable by non-technical judges.
