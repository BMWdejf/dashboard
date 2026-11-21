import { describe, expect, it } from '@jest/globals';

import { runTotals, summarizeFlexiRuns, type SyncRunInput } from './integrations-logic';

const now = new Date('2026-11-21T12:00:00Z');
const at = (iso: string) => new Date(iso);

const run = (over: Partial<SyncRunInput>): SyncRunInput => ({
  status: 'success',
  trigger: 'script',
  startedAt: at('2026-11-21T11:00:00Z'),
  finishedAt: at('2026-11-21T11:00:30Z'),
  counts: {},
  error: null,
  ...over,
});

describe('runTotals', () => {
  it('sums written and invalid over evidences', () => {
    expect(
      runTotals({ evidences: { cenik: { written: 10, invalid: 1 }, 'skladova-karta': { written: 5, invalid: 0 } } }),
    ).toEqual({ written: 15, invalid: 1 });
  });

  it('is zero for empty or odd counts', () => {
    expect(runTotals({})).toEqual({ written: 0, invalid: 0 });
    expect(runTotals(null)).toEqual({ written: 0, invalid: 0 });
    expect(runTotals({ evidences: { cenik: { written: 'x' } } })).toEqual({ written: 0, invalid: 0 });
  });
});

describe('summarizeFlexiRuns', () => {
  it('has no last run before the first sync', () => {
    expect(summarizeFlexiRuns([], now)).toEqual({
      last: null,
      lastSuccessAt: null,
      runs: 0,
      succeeded: 0,
      failed: 0,
      successRate: null,
      automatic: false,
    });
  });

  it('describes the latest run with its duration and totals', () => {
    const h = summarizeFlexiRuns([run({ counts: { evidences: { cenik: { written: 3, invalid: 2 } } } })], now);
    expect(h.last).toEqual({
      status: 'success',
      trigger: 'script',
      at: at('2026-11-21T11:00:30Z'),
      durationMs: 30_000,
      written: 3,
      invalid: 2,
    });
    expect(h.lastSuccessAt).toEqual(at('2026-11-21T11:00:30Z'));
  });

  it('counts runs in the window and the success rate of finished ones', () => {
    const h = summarizeFlexiRuns(
      [
        run({ status: 'running', startedAt: at('2026-11-21T11:55:00Z'), finishedAt: null }),
        run({ status: 'failed', trigger: 'cron' }),
        run({}),
        run({}),
        run({ startedAt: at('2026-11-01T10:00:00Z'), finishedAt: at('2026-11-01T10:01:00Z') }),
      ],
      now,
    );
    expect(h.last?.status).toBe('running');
    expect(h.last?.durationMs).toBeNull();
    expect(h).toMatchObject({ runs: 4, succeeded: 2, failed: 1, successRate: 66.7, automatic: true });
  });

  it('treats a run stuck in "running" as failed', () => {
    const h = summarizeFlexiRuns([run({ status: 'running', startedAt: at('2026-11-21T10:00:00Z'), finishedAt: null })], now);
    expect(h.last?.status).toBe('failed');
    expect(h.failed).toBe(1);
  });

  it('keeps the last success even outside the window', () => {
    const h = summarizeFlexiRuns(
      [run({ status: 'failed' }), run({ startedAt: at('2026-10-01T10:00:00Z'), finishedAt: at('2026-10-01T10:02:00Z') })],
      now,
    );
    expect(h.lastSuccessAt).toEqual(at('2026-10-01T10:02:00Z'));
    expect(h).toMatchObject({ runs: 1, failed: 1, successRate: 0, automatic: false });
  });
});
