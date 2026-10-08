# CarbonLensRegistry — contracts

Minimal tamper-evident anchor registry for carbon-credit verification records,
targeting **Polygon Amoy testnet** (not deployed yet — deploy with `npm run deploy:amoy`
once the deployer wallet is funded). All verification logic lives off-chain;
the contract records `(creditIdHash => findingsHash, verdict, timestamp)` exactly
once and tracks a single retirement per credit.

> **Known testnet limitation:** the contract is permissionless — anyone can
> anchor or retire any credit. Accepted as a testnet tradeoff for the hackathon
> (double-anchor is still prevented on-chain); a production deployment would
> gate writes behind an allowlist.

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
