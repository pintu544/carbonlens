// Shared input validation for the credits API.
//
// A vintage that passes Number.isInteger() can still exceed the Postgres
// INTEGER range (e.g. ?vintage=99999999999999), which used to crash the query
// with a 500. Clamp to a sane year range so bad input is a 400, never a 500.

export const MIN_VINTAGE_YEAR = 1900;
export const MAX_VINTAGE_YEAR = 2100;

export type VintageResult = { ok: true; year: number } | { ok: false; error: string };

export function parseVintageYear(value: unknown): VintageResult {
  let n: unknown = value;
  if (typeof n === 'string') {
    if (n.trim() === '') return { ok: false, error: 'vintage must be an integer year' };
    n = Number(n);
  }
  if (typeof n !== 'number' || !Number.isInteger(n)) {
    return { ok: false, error: 'vintage must be an integer year' };
  }
  if (n < MIN_VINTAGE_YEAR || n > MAX_VINTAGE_YEAR) {
    return {
      ok: false,
      error: `vintage must be a year between ${MIN_VINTAGE_YEAR} and ${MAX_VINTAGE_YEAR}`,
    };
  }
  return { ok: true, year: n };
}
