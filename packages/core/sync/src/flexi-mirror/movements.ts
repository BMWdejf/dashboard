import { bool, date, dec, refId, type FlexiRecord } from './map';

/**
 * Stock movements (evidence `skladovy-pohyb-polozka`) → net change per product
 * per day, for rebuilding the stock history backwards:
 *   stock at the end of day D = current stock − Σ changes after D.
 * Checked on the demo: the sum of all non-cancelled movements equals the
 * product's stock; cancelled lines (`storno = true`) don't count.
 */

export const MOVEMENT_EVIDENCE = 'skladovy-pohyb-polozka';
export const MOVEMENT_DETAIL = 'custom:id,cenik,datVyst,mnozMjPrijem,mnozMjVydej,storno' as const;

export interface MovementDelta {
  cenikFlexiId: number;
  /** `YYYY-MM-DD` (Flexi document date). */
  day: string;
  /** Receipts − issues on that day, as a decimal string. */
  delta: string;
}

/** Decimal strings → exact sum with up to 6 decimals (no float drift). */
function addDecimal(a: string, b: string): string {
  const scale = 1_000_000n;
  const toInt = (s: string) => {
    const neg = s.startsWith('-');
    const [i, f = ''] = s.replace('-', '').split('.');
    const v = BigInt(i || '0') * scale + BigInt((f + '000000').slice(0, 6));
    return neg ? -v : v;
  };
  const sum = toInt(a) + toInt(b);
  const neg = sum < 0n;
  const abs = neg ? -sum : sum;
  const frac = (abs % scale).toString().padStart(6, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${abs / scale}${frac ? `.${frac}` : ''}`;
}

/**
 * Sums movement lines per product and day. Lines without a product or date,
 * cancelled lines and zero changes are left out.
 */
export function movementDeltas(rows: FlexiRecord[]): MovementDelta[] {
  const sums = new Map<string, MovementDelta>();
  for (const r of rows) {
    if (bool(r.storno)) continue;
    const cenikFlexiId = refId(r, 'cenik');
    const day = date(r.datVyst);
    if (cenikFlexiId === null || day === null) continue;
    const change = addDecimal(dec(r.mnozMjPrijem) ?? '0', `-${dec(r.mnozMjVydej) ?? '0'}`.replace('--', ''));
    const key = `${cenikFlexiId}|${day}`;
    const prev = sums.get(key);
    sums.set(key, { cenikFlexiId, day, delta: prev ? addDecimal(prev.delta, change) : change });
  }
  return [...sums.values()].filter((d) => d.delta !== '0');
}
