/**
 * Delivery zones are sets of Spanish postcodes. The panel accepts them the
 * way people write them — "03001–03016, 03540" — and stores each code.
 */

const POSTCODE = /^\d{5}$/;

export function isPostcode(value: string): boolean {
  return POSTCODE.test(value);
}

/** How many codes one range may expand to, so a typo cannot create 90,000. */
const MAX_RANGE = 200;

export interface ParsedPostcodes {
  codes: string[];
  /** Pieces that were neither a postcode nor a range of them. */
  bad: string[];
}

/** "03001-03016 03540" → every code, sorted and without repeats. */
export function parsePostcodes(text: string): ParsedPostcodes {
  const codes = new Set<string>();
  const bad: string[] = [];
  const normalised = text.replace(/[‐-―−]/g, '-').replace(/\s*-\s*/g, '-');
  for (const piece of normalised.split(/[\s,;]+/).filter(Boolean)) {
    const range = /^(\d{5})-(\d{5})$/.exec(piece);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (to < from || to - from >= MAX_RANGE || range[1]!.slice(0, 2) !== range[2]!.slice(0, 2)) {
        bad.push(piece);
        continue;
      }
      for (let n = from; n <= to; n++) codes.add(String(n).padStart(5, '0'));
    } else if (isPostcode(piece)) {
      codes.add(piece);
    } else {
      bad.push(piece);
    }
  }
  return { codes: [...codes].sort(), bad };
}

/** The reverse: ["03001", …, "03016", "03540"] → "03001–03016, 03540". */
export function formatPostcodes(codes: readonly string[]): string {
  const sorted = [...new Set(codes)].filter(isPostcode).sort();
  const parts: string[] = [];
  let start: string | null = null;
  let prev: number | null = null;
  const flush = (end: number | null) => {
    if (start === null || end === null) return;
    const endCode = String(end).padStart(5, '0');
    if (endCode === start) parts.push(start);
    else if (end - Number(start) === 1) parts.push(start, endCode);
    else parts.push(`${start}–${endCode}`);
  };
  for (const code of sorted) {
    const n = Number(code);
    if (prev !== null && n === prev + 1) {
      prev = n;
      continue;
    }
    flush(prev);
    start = code;
    prev = n;
  }
  flush(prev);
  return parts.join(', ');
}

export interface ZoneLike {
  id: number;
  active: boolean;
  postalCodes: readonly string[];
}

/** The active zone that delivers to this postcode, if any. */
export function zoneFor<Z extends ZoneLike>(postcode: string, zones: readonly Z[]): Z | null {
  const code = postcode.trim();
  if (!isPostcode(code)) return null;
  return zones.find((z) => z.active && z.postalCodes.includes(code)) ?? null;
}

/** Codes that another active zone already covers: one postcode, one bakery. */
export function overlaps(codes: readonly string[], zones: readonly ZoneLike[], exceptZoneId: number | null): string[] {
  const taken = new Set(zones.filter((z) => z.active && z.id !== exceptZoneId).flatMap((z) => z.postalCodes));
  return codes.filter((c) => taken.has(c));
}
