# Fixtures — CarbonLens seed data

> Standing rule (spec-driven skill #15): fixture data, not hand-seeded data.

## Contract

- **Fixed reference time:** `2026-10-01T00:00:00Z` (`meta.referenceTime`). All relative dates
  in the dataset are computed from this instant, so re-seeding never shifts the data.
- **Stable IDs:** credits use `CR-2026-001`… — the same file always yields the same IDs.
- **Idempotent seed:** running the seed script twice produces zero duplicates (upsert on `id`).
- **Refresh never overwrites user data:** re-seeding inserts missing fixture records and leaves
  user-added credits, manual verdict overrides, and anchor receipts untouched.
- **Deterministic:** every name, hash, and timestamp in this folder is fixed. Nothing is
  generated randomly at seed time.

## Files

- `carbon-credits.json` — scaffold sample: 4 credits demonstrating the schema, including one
  planted double-count pair (CR-2026-003 / CR-2026-004 share a serial range) and one
  provenance gap (CR-2026-002 is missing `methodology`). The full 24-credit dataset lands in
  T-1.1; the contract above already applies.

## Schema (per credit)

`id, registry, projectId, projectName, vintage, serialStart, serialEnd, quantityTco2e,
methodology, standard, proponent, sourceDocHash`
