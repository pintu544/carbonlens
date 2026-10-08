import { describe, expect, it } from 'vitest';
import { MAX_VINTAGE_YEAR, MIN_VINTAGE_YEAR, parseVintageYear } from './validate.js';

describe('parseVintageYear', () => {
  it('accepts a normal year as string or number', () => {
    expect(parseVintageYear('2024')).toEqual({ ok: true, year: 2024 });
    expect(parseVintageYear(2024)).toEqual({ ok: true, year: 2024 });
  });

  it('accepts the boundary years', () => {
    expect(parseVintageYear(MIN_VINTAGE_YEAR)).toEqual({ ok: true, year: MIN_VINTAGE_YEAR });
    expect(parseVintageYear(MAX_VINTAGE_YEAR)).toEqual({ ok: true, year: MAX_VINTAGE_YEAR });
  });

  it('rejects the QA repro: integer beyond int4 range', () => {
    const r = parseVintageYear('99999999999999');
    expect(r.ok).toBe(false);
  });

  it('rejects out-of-range years', () => {
    expect(parseVintageYear('1899').ok).toBe(false);
    expect(parseVintageYear('2101').ok).toBe(false);
    expect(parseVintageYear(-5).ok).toBe(false);
  });

  it('rejects non-integers and junk', () => {
    for (const bad of ['abc', '', '   ', '2024.5', '20x4', null, undefined, {}, NaN]) {
      expect(parseVintageYear(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('rejects hex-looking strings that Number() would coerce', () => {
    // Number('0x10') === 16 — an integer, but outside the sane year range.
    expect(parseVintageYear('0x10').ok).toBe(false);
  });
});
