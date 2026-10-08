import { strict as assert } from "node:assert";
import { ethers } from "hardhat";

/**
 * Proves the on-chain guards every demo beat depends on:
 *  - anchorVerification reverts on a double anchor (FR-5, on-chain backstop)
 *  - retireCredit reverts when unanchored or already retired (FR-8)
 */
describe("CarbonLensRegistry", function () {
  const VERIFIED = 1;
  const NEEDS_REVIEW = 2;

  async function deploy() {
    const factory = await ethers.getContractFactory("CarbonLensRegistry");
    const registry = await factory.deploy();
    await registry.waitForDeployment();
    return { registry };
  }

  function idHash(id: string): string {
    // Must match the off-chain convention: sha256(creditId) as bytes32.
    return ethers.sha256(ethers.toUtf8Bytes(id));
  }

  it("anchors a verification and exposes it via records()", async function () {
    const { registry } = await deploy();
    const h = idHash("CR-2026-001");
    const findings = idHash("findings-001");
    await (await registry.anchorVerification(h, findings, VERIFIED)).wait();

    const r = await registry.records(h);
    assert.equal(r.findingsHash, findings);
    assert.equal(r.verdict, BigInt(VERIFIED));
    assert.equal(r.retired, false);
    assert.ok(r.timestamp > 0n, "timestamp should be set");
  });

  it("reverts on double anchor (AlreadyAnchored)", async function () {
    const { registry } = await deploy();
    const h = idHash("CR-2026-002");
    await (await registry.anchorVerification(h, idHash("f"), NEEDS_REVIEW)).wait();

    await assert.rejects(
      registry.anchorVerification(h, idHash("f2"), VERIFIED),
      /AlreadyAnchored/
    );
    // Original record untouched.
    const r = await registry.records(h);
    assert.equal(r.verdict, BigInt(NEEDS_REVIEW));
  });

  it("reverts on invalid verdict", async function () {
    const { registry } = await deploy();
    await assert.rejects(
      registry.anchorVerification(idHash("CR-2026-003"), idHash("f"), 9),
      /InvalidVerdict/
    );
    await assert.rejects(
      registry.anchorVerification(idHash("CR-2026-003"), idHash("f"), 0),
      /InvalidVerdict/
    );
  });

  it("reverts retireCredit on an unanchored credit (NotAnchored)", async function () {
    const { registry } = await deploy();
    await assert.rejects(
      registry.retireCredit(idHash("CR-2026-999")),
      /NotAnchored/
    );
  });

  it("retires an anchored credit exactly once", async function () {
    const { registry } = await deploy();
    const h = idHash("CR-2026-004");
    await (await registry.anchorVerification(h, idHash("f"), VERIFIED)).wait();
    await (await registry.retireCredit(h)).wait();

    const r = await registry.records(h);
    assert.equal(r.retired, true);

    await assert.rejects(registry.retireCredit(h), /AlreadyRetired/);
  });

  it("emits Anchored and Retired events with the creditIdHash indexed", async function () {
    const { registry } = await deploy();
    const h = idHash("CR-2026-005");
    const tx = await registry.anchorVerification(h, idHash("f"), VERIFIED);
    const receipt = await tx.wait();
    const anchored = receipt!.logs.map((l: any) => {
      try {
        return registry.interface.parseLog(l);
      } catch {
        return null;
      }
    }).find((e: any) => e?.name === "Anchored");
    assert.ok(anchored, "Anchored event should be emitted");
    assert.equal(anchored.args.creditIdHash, h);

    const tx2 = await registry.retireCredit(h);
    const receipt2 = await tx2.wait();
    const retired = receipt2!.logs.map((l: any) => {
      try {
        return registry.interface.parseLog(l);
      } catch {
        return null;
      }
    }).find((e: any) => e?.name === "Retired");
    assert.ok(retired, "Retired event should be emitted");
    assert.equal(retired.args.creditIdHash, h);
  });
});
