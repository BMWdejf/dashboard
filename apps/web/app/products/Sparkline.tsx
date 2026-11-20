import styles from './products.module.css';

const W = 60;
const H = 40;
const PAD = 3;

/**
 * KPI sparkline (server-rendered SVG, no JS). Values before the history starts
 * are null and left out. With fewer than two points it draws a dashed baseline
 * and says in the tooltip why there is no curve yet.
 */
export function Sparkline({
  values,
  label,
  waiting,
}: {
  values: (number | null)[];
  /** Accessible name, e.g. "Skladem: vývoj za poslední měsíc". */
  label: string;
  /** Tooltip while there are not enough points. */
  waiting: string;
}) {
  const pts = values
    .map((v, i) => (v === null ? null : { i, v }))
    .filter((p): p is { i: number; v: number } => p !== null);

  if (pts.length < 2) {
    return (
      <svg className={styles.spark} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}. ${waiting}`}>
        <title>{waiting}</title>
        <line x1={PAD} x2={W - PAD} y1={H - PAD - 6} y2={H - PAD - 6} className={styles.sparkWaiting} />
        {pts[0] && <circle cx={W - PAD} cy={H - PAD - 6} r={2.5} className={styles.sparkDot} />}
      </svg>
    );
  }

  const n = values.length - 1 || 1;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / n) * (W - 2 * PAD);
  // A flat series sits in the middle instead of on the floor.
  const y = (v: number) => (max === min ? H / 2 : H - PAD - ((v - min) / span) * (H - 2 * PAD));
  const line = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const area = `${line} L${x(last.i).toFixed(1)},${H} L${x(first.i).toFixed(1)},${H} Z`;

  return (
    <svg className={styles.spark} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <title>{label}</title>
      <path d={area} className={styles.sparkArea} />
      <path d={line} className={styles.sparkLine} />
      <circle cx={x(last.i)} cy={y(last.v)} r={2.5} className={styles.sparkDot} />
    </svg>
  );
}
