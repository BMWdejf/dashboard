import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, jest } from '@jest/globals';

import type { MirrorFlexiReader, MirrorStore } from '@repo/core-sync';

import { FLEXI_SYNC, FlexiSyncService, type SyncRunsRepo } from './flexi-sync.service';

function fakes() {
  const finished: string[] = [];
  const store = {
    upsert: async (_e: string, rows: unknown[]) => ({ written: rows.length, skipped: 0 }),
    listFlexiIds: async () => [],
    applyDeletes: async () => 0,
    refreshStock: async () => 0,
    getCursor: async () => null,
    setCursor: async () => {},
    startRun: async () => 'run-42',
    finishRun: async (_id: string, r: { status: string }) => {
      finished.push(r.status);
    },
  } as unknown as MirrorStore;
  const flexi: MirrorFlexiReader = {
    list: async () => ({ rows: [] }),
    changes: async () => ({ changes: [], globalVersion: 1 }),
  };
  const runs: SyncRunsRepo = {
    getRunning: jest.fn(async () => null),
    get: jest.fn(async (id: string) => (id === 'run-42' ? { id } : null)),
    getLast: jest.fn(async () => null),
  };
  return { store, flexi, runs, finished };
}

async function make(f = fakes()) {
  const mod = await Test.createTestingModule({
    providers: [
      FlexiSyncService,
      { provide: FLEXI_SYNC, useValue: { deps: () => ({ flexi: f.flexi, store: f.store }), runs: f.runs } },
    ],
  }).compile();
  return { service: mod.get(FlexiSyncService), ...f };
}

describe('FlexiSyncService', () => {
  it('returns the run id and finishes the run in the background', async () => {
    const { service, finished } = await make();
    await expect(service.start('api', false)).resolves.toEqual({ runId: 'run-42' });
    await new Promise((r) => setTimeout(r, 10));
    expect(finished).toEqual(['success']);
  });

  it('refuses a second run while one is running', async () => {
    const f = fakes();
    (f.runs.getRunning as jest.Mock<SyncRunsRepo['getRunning']>).mockResolvedValueOnce({ id: 'other' });
    const { service } = await make(f);
    await expect(service.start('api', false)).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s an unknown run', async () => {
    const { service } = await make();
    await expect(service.getRun('nope')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getRun('run-42')).resolves.toEqual({ id: 'run-42' });
  });
});
