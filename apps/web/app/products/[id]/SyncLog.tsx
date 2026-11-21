'use client';

import { useState } from 'react';

import d from './detail.module.css';

export interface SyncLogRow {
  id: string;
  time: string;
  status: 'success' | 'failed' | 'running';
  statusLabel: string;
  trigger: string;
  text: string;
}

type Filter = 'all' | 'ok' | 'failed';

/** "All / OK / Errors" pills over the run log (design: Filter Pills). */
export function SyncLog({
  rows,
  labels,
}: {
  rows: SyncLogRow[];
  labels: { all: string; ok: string; failed: string; filter: string; empty: string };
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const ok = rows.filter((r) => r.status === 'success').length;
  const failed = rows.filter((r) => r.status === 'failed').length;
  const shown = rows.filter((r) =>
    filter === 'all' ? true : filter === 'ok' ? r.status === 'success' : r.status === 'failed',
  );
  const pills: { key: Filter; label: string }[] = [
    { key: 'all', label: labels.all.replace('{n}', String(rows.length)) },
    { key: 'ok', label: labels.ok.replace('{n}', String(ok)) },
    { key: 'failed', label: labels.failed.replace('{n}', String(failed)) },
  ];

  return (
    <>
      <div className={d.pills} role="group" aria-label={labels.filter}>
        {pills.map((p) => (
          <button
            key={p.key}
            type="button"
            className={d.pill}
            aria-pressed={filter === p.key}
            onClick={() => setFilter(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <ol className={d.logRows}>
        {shown.length === 0 && <li className={d.logEmpty}>{labels.empty}</li>}
        {shown.map((r) => (
          <li key={r.id} className={d.logRow}>
            <span className={d.logTime}>{r.time}</span>
            <span className={`${d.logStatus} ${d[`log_${r.status}`]}`}>{r.statusLabel}</span>
            <span className={d.logTrigger}>{r.trigger}</span>
            <span className={d.logText} title={r.text}>
              {r.text}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
