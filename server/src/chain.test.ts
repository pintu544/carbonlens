import { describe, expect, it } from 'vitest';
import {
  AMOYSCAN_ADDRESS_URL,
  AMOYSCAN_TX_URL,
  VERDICT_CODE,
  backoffSeconds,
  creditIdHash,
  toBytes32,
  withTimeout,
  MAX_ATTEMPTS,
} from './chain.js';

describe('creditIdHash', () => {
  it('returns 0x-prefixed 32-byte hex (bytes32)', () => {
    const h = creditIdHash('CR-2026-001');
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('is deterministic and input-sensitive', () => {
    expect(creditIdHash('CR-2026-001')).toBe(creditIdHash('CR-2026-001'));
    expect(creditIdHash('CR-2026-001')).not.toBe(creditIdHash('CR-2026-002'));
  });

  it('matches the contract convention: sha256 of the UTF-8 credit ID', () => {
    // Independent vector (node:crypto) — the Hardhat test proves the same
    // value anchors on-chain via ethers.sha256(toUtf8Bytes(id)).
    expect(creditIdHash('CR-2026-001')).toBe(
      '0xc3d78e3db41b63310aecb7f48256a6d261db3f04462ca939f071ac717937713a'
    );
  });
});

describe('toBytes32', () => {
  it('normalizes bare hex to 0x-prefixed lowercase', () => {
    expect(toBytes32('AB'.repeat(32))).toBe('0x' + 'ab'.repeat(32));
    expect(toBytes32('0x' + 'ab'.repeat(32))).toBe('0x' + 'ab'.repeat(32));
  });

  it('rejects non-32-byte input', () => {
    expect(() => toBytes32('0x1234')).toThrow();
    expect(() => toBytes32('zz'.repeat(32))).toThrow();
    expect(() => toBytes32('')).toThrow();
  });
});

describe('VERDICT_CODE', () => {
  it('mirrors CarbonLensRegistry.sol exactly', () => {
    expect(VERDICT_CODE).toEqual({ VERIFIED: 1, NEEDS_REVIEW: 2, REJECTED: 3 });
  });
});

describe('backoffSeconds', () => {
  it('grows exponentially and caps at 30 minutes', () => {
    expect(backoffSeconds(0)).toBe(5);
    expect(backoffSeconds(1)).toBe(15);
    expect(backoffSeconds(2)).toBe(45);
    expect(backoffSeconds(100)).toBe(1800);
  });

  it('has a bounded max-attempts ceiling', () => {
    expect(MAX_ATTEMPTS).toBeGreaterThan(0);
  });
});

describe('AmoyScan URLs', () => {
  it('builds tx and address links on amoy.polygonscan.com', () => {
    expect(AMOYSCAN_TX_URL('0xabc')).toBe('https://amoy.polygonscan.com/tx/0xabc');
    expect(AMOYSCAN_ADDRESS_URL('0xdef')).toBe('https://amoy.polygonscan.com/address/0xdef');
  });
});

describe('withTimeout', () => {
  it('resolves fast promises untouched', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, 'fast')).resolves.toBe(42);
  });

  it('rejects when the promise hangs', async () => {
    await expect(
      withTimeout(new Promise(() => {}), 50, 'slow-op')
    ).rejects.toThrow('slow-op timed out after 50ms');
  });
});
