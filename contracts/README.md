# CarbonLensRegistry — contracts

Minimal tamper-evident anchor registry for carbon-credit verification records,
deployed to **Polygon Amoy testnet**. All verification logic lives off-chain;
the contract records `(creditIdHash => findingsHash, verdict, timestamp)` exactly
once and tracks a single retirement per credit.

- `contracts/CarbonLensRegistry.sol` — the registry (~70 lines, two state-changing functions)
- `scripts/deploy.ts` — Amoy deploy script (prints address + AmoyScan link)
- `test/registry.test.ts` — Hardhat tests proving the on-chain guards

## Conventions (do not break)

- `creditIdHash` = `sha256(creditId)` as bytes32 (NOT keccak256 — must match the off-chain engine)
- Verdict codes: `1 = VERIFIED`, `2 = NEEDS_REVIEW`, `3 = REJECTED` (mirrors the engine)
- A record exists iff `timestamp != 0`

## Commands

```bash
npm install --no-bin-links --ignore-scripts
npm test          # Hardhat tests on the in-process network
npm run compile
npm run deploy:amoy   # needs DEPLOYER_PRIVATE_KEY funded via https://faucet.polygon.technology
```
