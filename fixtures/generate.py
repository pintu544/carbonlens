#!/usr/bin/env python3
"""Deterministic generator for the CarbonLens fixture dataset.

Running this script always produces byte-identical output: every name, hash,
and timestamp is fixed. Nothing is random. The committed
`carbon-credits.json` is the output of this script; re-running it is only
needed if the dataset itself is intentionally changed.

Planted cases (so the verification engine has something to catch):
  - Double-count #1: CR-2026-003 / CR-2026-004 share an identical serial range.
  - Double-count #2: CR-2026-010 reuses CR-2026-009's sourceDocHash
    (same document claimed twice under different credit IDs).
  - Double-count #3: CR-2026-016's serial range partially overlaps CR-2026-015's.
  - Provenance gap #1: CR-2026-002 has an empty methodology.
  - Provenance gap #2: CR-2026-014 has an empty proponent.
  - Anomaly #1: CR-2026-006 has vintage 2027 (future vs reference time 2026-10-01).
  - Anomaly #2: CR-2026-013 claims 400,000 tCO2e against a 150,000 project capacity.
"""

import hashlib
import json

REFERENCE_TIME = "2026-10-01T00:00:00Z"
REGISTRY = "VCS-FIXTURE"


def doc_hash(credit_id: str, project_id: str) -> str:
    return hashlib.sha256(f"carbonlens-fixture-doc|{credit_id}|{project_id}".encode()).hexdigest()


PROJECTS = [
    {
        "projectId": "VCS-4821",
        "projectName": "Mekong Delta Mangrove Restoration",
        "proponent": "GreenCanopy Ltd",
        "methodology": "VM0042",
        "standard": "VCS v4.5",
        "capacityTco2e": 60000,
        "location": "Vietnam",
    },
    {
        "projectId": "VCS-5177",
        "projectName": "Rajasthan Solar Farm Expansion",
        "proponent": "SunHarvest Energy",
        "methodology": "AMS-I.D.",
        "standard": "VCS v4.5",
        "capacityTco2e": 200000,
        "location": "India",
    },
    {
        "projectId": "VCS-6230",
        "projectName": "Congo Basin REDD+ Conservation",
        "proponent": "ForetVive SARL",
        "methodology": "VM0015",
        "standard": "VCS v4.7",
        "capacityTco2e": 500000,
        "location": "DR Congo",
    },
    {
        "projectId": "VCS-7092",
        "projectName": "Gujarat Wind Corridor",
        "proponent": "VayuPower Pvt Ltd",
        "methodology": "ACM0002",
        "standard": "VCS v4.5",
        "capacityTco2e": 150000,
        "location": "India",
    },
    {
        "projectId": "VCS-8155",
        "projectName": "Amazon Reforestation Corridor",
        "proponent": "SelvaNova Ltda",
        "methodology": "AR-ACM0003",
        "standard": "VCS v4.7",
        "capacityTco2e": 300000,
        "location": "Brazil",
    },
    {
        "projectId": "VCS-9014",
        "projectName": "Punjab Biogas Digesters",
        "proponent": "AgriGas Cooperative",
        "methodology": "AMS-III.D.",
        "standard": "VCS v4.5",
        "capacityTco2e": 40000,
        "location": "India",
    },
]

VINTAGES = [2024, 2023, 2024, 2022]
QUANTITIES = [12500, 10000, 15000, 12500]

# (credit_id, project_index, vintage_override, quantity_override, field_override)
PLAN = [
    ("CR-2026-001", 0, None, None, {}),
    ("CR-2026-002", 0, None, None, {"methodology": ""}),  # provenance gap #1
    ("CR-2026-003", 0, None, None, {}),
    ("CR-2026-004", 0, None, None, {"serialCloneOf": "CR-2026-003"}),  # double-count #1
    ("CR-2026-005", 1, None, None, {}),
    ("CR-2026-006", 1, 2027, None, {}),  # anomaly #1: future vintage
    ("CR-2026-007", 1, None, None, {}),
    ("CR-2026-008", 1, None, None, {}),
    ("CR-2026-009", 2, None, None, {}),
    ("CR-2026-010", 2, None, None, {"docHashCloneOf": "CR-2026-009"}),  # double-count #2
    ("CR-2026-011", 2, None, None, {}),
    ("CR-2026-012", 2, None, None, {}),
    ("CR-2026-013", 3, None, 400000, {}),  # anomaly #2: volume vs capacity
    ("CR-2026-014", 3, None, None, {"proponent": ""}),  # provenance gap #2
    ("CR-2026-015", 3, None, None, {}),
    ("CR-2026-016", 3, None, None, {"serialOverlapOf": "CR-2026-015"}),  # double-count #3
    ("CR-2026-017", 4, None, None, {}),
    ("CR-2026-018", 4, None, None, {}),
    ("CR-2026-019", 4, None, None, {}),
    ("CR-2026-020", 4, None, None, {}),
    ("CR-2026-021", 5, None, None, {}),
    ("CR-2026-022", 5, None, None, {}),
    ("CR-2026-023", 5, None, None, {}),
    ("CR-2026-024", 5, None, None, {}),
]

UNIT = 12500


def main() -> None:
    credits = []
    by_id = {}
    for idx, (cid, pidx, vintage_ov, qty_ov, overrides) in enumerate(PLAN):
        proj = PROJECTS[pidx]
        k = sum(1 for c in credits if c["projectId"] == proj["projectId"])  # 0-based within project
        vintage = vintage_ov if vintage_ov is not None else VINTAGES[k % len(VINTAGES)]
        quantity = qty_ov if qty_ov is not None else QUANTITIES[k % len(QUANTITIES)]
        base = (pidx + 1) * 100000
        serial_start = base + k * UNIT + 1
        serial_end = serial_start + UNIT - 1

        credit = {
            "id": cid,
            "registry": REGISTRY,
            "projectId": proj["projectId"],
            "projectName": proj["projectName"],
            "vintage": vintage,
            "serialStart": serial_start,
            "serialEnd": serial_end,
            "quantityTco2e": quantity,
            "methodology": proj["methodology"],
            "standard": proj["standard"],
            "proponent": proj["proponent"],
            "sourceDocHash": doc_hash(cid, proj["projectId"]),
        }

        if "serialCloneOf" in overrides:
            src = by_id[overrides["serialCloneOf"]]
            credit["serialStart"], credit["serialEnd"] = src["serialStart"], src["serialEnd"]
        if "serialOverlapOf" in overrides:
            src = by_id[overrides["serialOverlapOf"]]
            credit["serialStart"] = src["serialStart"] + UNIT // 2
            credit["serialEnd"] = credit["serialStart"] + UNIT - 1
        if "docHashCloneOf" in overrides:
            credit["sourceDocHash"] = by_id[overrides["docHashCloneOf"]]["sourceDocHash"]
        if "methodology" in overrides:
            credit["methodology"] = overrides["methodology"]
        if "proponent" in overrides:
            credit["proponent"] = overrides["proponent"]

        credits.append(credit)
        by_id[cid] = credit

    dataset = {
        "meta": {
            "referenceTime": REFERENCE_TIME,
            "registry": REGISTRY,
            "version": 1,
            "description": (
                "Fictional carbon-credit fixtures for CarbonLens. All projects, "
                "companies, hashes, and timestamps are fabricated and deterministic. "
                "Includes 3 planted double-count cases and 2 provenance gaps."
            ),
        },
        "projects": PROJECTS,
        "credits": credits,
    }

    with open("carbon-credits.json", "w") as f:
        json.dump(dataset, f, indent=2)
        f.write("\n")

    print(f"wrote {len(credits)} credits across {len(PROJECTS)} projects")


if __name__ == "__main__":
    main()
