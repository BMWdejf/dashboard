import styles from './dashboard.module.css';

// Small SVG charts for the dashboard. Server components, no chart library.

interface Series {
  values: number[];
  color: string;
  label: string;
}

type Pt = [number, number];

/** Smooth path through points (Catmull-Rom → cubic Bézier). */
function smoothPath(pts: Pt[]): string {
  const first = pts[0];
  if (!first) return '';
  let d = `M${first[0]},${first[1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i] as Pt;
    const p2 = pts[i + 1] as Pt;
    const p0 = pts[i - 1] ?? p1;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

const niceMax = (max: number) => {
  if (max <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / step) * step;
};

export function LineChart({
  labels,
  series,
  formatTick,
  label,
}: {
  labels: string[];
  series: Series[];
  formatTick: (n: number) => string;
  label: string;
}) {
  const W = 640;
  const H = 360;
  const pad = { l: 48, r: 8, t: 12, b: 28 };
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, labels.length - 1);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img" aria-label={label}>
      <defs>
        {series.map((s, i) => (
          <linearGradient key={s.label} id={`area-${i}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className={styles.gridLine} />
          <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className={styles.axis}>
            {formatTick(t)}
          </text>
        </g>
      ))}
      {labels.map((l, i) => (
        <text key={l} x={x(i)} y={H - 8} textAnchor="middle" className={styles.axis}>
          {l}
        </text>
      ))}
      {series.map((s, i) => {
        const pts = s.values.map((v, j): Pt => [x(j), y(v)]);
        const line = smoothPath(pts);
        const first = pts[0];
        const last = pts[pts.length - 1];
        return (
          <g key={s.label}>
            {first && last && (
              <path
                d={`${line} L${last[0]},${y(0)} L${first[0]},${y(0)} Z`}
                fill={`url(#area-${i})`}
              />
            )}
            <path d={line} fill="none" stroke={s.color} strokeWidth="2" />
          </g>
        );
      })}
    </svg>
  );
}

export function BarChart({
  points,
  label,
}: {
  points: { label: string; value: number }[];
  label: string;
}) {
  const W = 300;
  const H = 120;
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const slot = W / Math.max(1, points.length);
  const bw = Math.min(14, slot * 0.5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img" aria-label={label}>
      <defs>
        <linearGradient id="bar" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#cb3cff" />
          <stop offset="100%" stopColor="#7f25fb" />
        </linearGradient>
      </defs>
      {points.map((p, i) => {
        const h = (p.value / max) * (H - 20);
        return (
          <g key={p.label}>
            <rect
              x={i * slot + (slot - bw) / 2}
              y={H - 16 - h}
              width={bw}
              height={h}
              rx="3"
              fill="url(#bar)"
            />
            {i % 3 === 0 && (
              <text x={i * slot + slot / 2} y={H - 2} textAnchor="middle" className={styles.axis}>
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Sparkline({
  points,
  label,
}: {
  points: { label: string; value: number }[];
  label: string;
}) {
  const W = 300;
  const H = 90;
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const pts = points.map(
    (p, i): Pt => [(i * W) / Math.max(1, points.length - 1), 6 + (1 - p.value / max) * (H - 12)],
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img" aria-label={label}>
      <path d={smoothPath(pts)} fill="none" stroke="#21c3fc" strokeWidth="2" />
    </svg>
  );
}

const DEVICE_COLORS = ['#cb3cff', '#21c3fc', '#0e43fb'];
export const deviceColor = (i: number) => DEVICE_COLORS[i % DEVICE_COLORS.length];

/** Semi-circle gauge split by share, with the total in the middle. */
export function Gauge({ parts, total }: { parts: { label: string; value: number }[]; total: string }) {
  const r = 80;
  const len = Math.PI * r;
  const sum = parts.reduce((a, p) => a + p.value, 0) || 1;
  const arc = 'M20,100 A80,80 0 0 1 180,100';
  const segments = parts.reduce<{ label: string; seg: number; offset: number }[]>((acc, p) => {
    const prev = acc[acc.length - 1];
    const offset = prev ? prev.offset + prev.seg : 0;
    acc.push({ label: p.label, seg: (p.value / sum) * len, offset });
    return acc;
  }, []);
  return (
    <div className={styles.gauge}>
      <svg viewBox="0 0 200 110" role="img" aria-label="Uživatelé podle zařízení">
        <path d={arc} fill="none" stroke="#0b1739" strokeWidth="16" />
        {segments.map((s, i) => (
          <path
            key={s.label}
            d={arc}
            fill="none"
            stroke={deviceColor(i)}
            strokeWidth="16"
            strokeDasharray={`${Math.max(0, s.seg - 3)} ${len}`}
            strokeDashoffset={-s.offset}
          />
        ))}
      </svg>
      <span className={styles.gaugeTotal}>{total}</span>
    </div>
  );
}
