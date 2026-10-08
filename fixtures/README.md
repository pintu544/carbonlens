# Fixtures — CarbonLens seed data

> Standing rule (spec-driven skill #15): fixture data, not hand-seeded data.

## Contract

- **Fixed reference time:** `2026-10-01T00:00:00Z` (`meta.referenceTime`). All relative dates
  in the dataset are computed from this instant, so re-seeding never shifts the data.
- **Stable IDs:** credits use `CR-2026-001`…`CR-2026-024` — the same file always yields the same IDs.
- **Deterministic:** every name, hash, and timestamp in this folder is fixed. Nothing is
  generated randomly at seed time. `generate.py` reproduces `carbon-credits.json`
  byte-identically; run it only when the dataset itself is intentionally changed.
- **Idempotent seed:** running the seed script twice produces zero duplicates (upsert on `id`).
- **Refresh never overwrites user data:** re-seeding inserts missing fixture records and leaves
  user-added credits, manual verdict overrides, and anchor receipts untouched.

## Files

- `generate.py` — deterministic generator for the dataset (see module docstring).
- `carbon-credits.json` — 24 credits across 6 fictional projects, Verra-VCS-shaped schema,
  plus a `projects` array carrying per-project capacity (used by the volume-vs-capacity check).

## Planted cases (for the verification engine to catch)

| Case | Credits | What's wrong |
|---|---|---|
| Double-count #1 | CR-2026-003 / CR-2026-004 | Identical serial ranges claimed twice |
| Double-count #2 | CR-2026-009 / CR-2026-010 | Same `sourceDocHash` under two credit IDs |
| Double-count #3 | CR-2026-015 / CR-2026-016 | Partially overlapping serial ranges |
| Provenance gap #1 | CR-2026-002 | Empty `methodology` |
| Provenance gap #2 | CR-2026-014 | Empty `proponent` |
| Anomaly #1 | CR-2026-006 | Vintage 2027 — future vs the 2026-10-01 reference time |
| Anomaly #2 | CR-2026-013 | 400,000 tCO2e claimed against a 150,000 project capacity |

## Schema (per credit)

`id, registry, projectId, projectName, vintage, serialStart, serialEnd, quantityTco2e,
methodology, standard, proponent, sourceDocHash`

## Schema (per project)

`projectId, projectName, proponent, methodology, standard, capacityTco2e, location`
