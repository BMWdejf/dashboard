import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, jest } from '@jest/globals';

import type { CheckDeps, SupplierFeedInput } from '@repo/core-sync';

import { SyncTokenGuard } from '../flexi-sync/sync-token.guard';
import { SupplierFeedsController } from './supplier-feeds.controller';
import { SUPPLIER_FEEDS, SupplierFeedsService, type SupplierFeedRepo } from './supplier-feeds.service';

const FEED = readFileSync(join(__dirname, '../../../../packages/core/sync/src/supplier-feed/fixtures/heureka.xml'), 'utf8');
const URL_ = 'https://dodavatel.example/heureka.xml';

const input: SupplierFeedInput = {
  url: URL_,
  name: 'Dodavatel',
  dialect: 'shopitem',
  itemElement: 'SHOPITEM',
  mapping: { ITEM_ID: 'kod', PRODUCTNAME: 'nazev' },
  importIntervalMinutes: 60,
};

async function make(opts: { body?: string; status?: number; repo?: Partial<SupplierFeedRepo>; addresses?: string[] } = {}) {
  const fetchMock = jest.fn(async () => new Response(opts.body ?? FEED, { status: opts.status ?? 200 }));
  const deps: CheckDeps = {
    fetch: fetchMock as unknown as typeof fetch,
    lookup: async () => opts.addresses ?? ['93.184.216.34'],
    now: () => Date.parse('2026-11-21T10:00:00Z'),
  };
  const replaceItems = jest.fn(async (_id: string, rows: unknown[]) => ({ written: rows.length, removed: 0 }));
  const repo: SupplierFeedRepo = {
    create: jest.fn(async () => 'feed-1'),
    claim: jest.fn(async (id: string) => ({ id, url: URL_, itemElement: 'SHOPITEM', mapping: input.mapping, importIntervalMinutes: 60 })),
    finish: jest.fn(async () => undefined),
    listDue: jest.fn(async () => ['a', 'b']),
    exists: jest.fn(async () => true),
    store: () => ({ replaceItems }),
    isDuplicate: (e) => e instanceof Error && e.message === 'dup',
    ...opts.repo,
  };
  const mod = await Test.createTestingModule({
    controllers: [SupplierFeedsController],
    providers: [
      SupplierFeedsService,
      { provide: SUPPLIER_FEEDS, useValue: { deps, repo, scheduler: false } },
    ],
  })
    .overrideGuard(SyncTokenGuard)
    .useValue({ canActivate: () => true })
    .compile();
  return { controller: mod.get(SupplierFeedsController), service: mod.get(SupplierFeedsService), repo, replaceItems, fetchMock };
}

describe('SupplierFeedsController', () => {
  it('previews tags and a mapping', async () => {
    const { controller } = await make();
    const r = await controller.preview({ url: URL_, itemElement: 'SHOPITEM' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.preview.items).toBe(4);
      expect(r.preview.mapping).toMatchObject({ ITEM_ID: 'kod', PRODUCTNAME: 'nazev', PRICE_VAT: 'cenaBezna' });
    }
  });

  it('returns the failure code when the feed is unreachable, never the body', async () => {
    const { controller } = await make({ body: 'secret upstream page', status: 500 });
    await expect(controller.preview({ url: URL_, itemElement: 'SHOPITEM' })).resolves.toEqual({
      ok: false,
      failure: { code: 'httpStatus', params: { status: 500 } },
    });
  });

  it('rejects a private address before fetching', async () => {
    const { controller, fetchMock } = await make({ addresses: ['192.168.1.5'] });
    await expect(controller.preview({ url: URL_, itemElement: 'SHOPITEM' })).resolves.toMatchObject({ ok: false, failure: { code: 'blocked' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates the body', async () => {
    const { controller } = await make();
    expect(() => controller.preview({ url: 'file:///etc/passwd', itemElement: 'SHOPITEM' })).toThrow('Invalid feed details.');
    expect(() => controller.create({ ...input, importIntervalMinutes: 1 })).toThrow('Invalid feed details.');
  });

  it('saves a feed, imports it, and schedules the next import', async () => {
    const { controller, service, repo, replaceItems } = await make();
    await expect(controller.create({ ...input, createdBy: 'user-1' })).resolves.toEqual({ id: 'feed-1' });
    expect(repo.create).toHaveBeenCalledWith(input, 'user-1');
    await service.idle();
    expect(replaceItems).toHaveBeenCalledTimes(1);
    expect(repo.finish).toHaveBeenCalledWith(
      'feed-1',
      expect.objectContaining({ status: 'success', nextImportAt: new Date('2026-11-21T11:00:00Z') }),
    );
  });

  it('refuses a mapping without a key or name, and a URL that exists', async () => {
    const { controller } = await make({ repo: { create: jest.fn(async () => Promise.reject(new Error('dup'))) } });
    await expect(controller.create({ ...input, mapping: { ITEM_ID: 'kod' } })).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(controller.create(input)).rejects.toBeInstanceOf(ConflictException);
  });

  it('records a failed import as a code and retries in 30 minutes', async () => {
    const { controller, service, repo, replaceItems } = await make({ body: '<SHOP><SHOPITEM>', status: 200 });
    await controller.start('3f0c1c56-0000-4000-8000-000000000001');
    await service.idle();
    expect(replaceItems).not.toHaveBeenCalled();
    expect(repo.finish).toHaveBeenCalledWith('3f0c1c56-0000-4000-8000-000000000001', {
      status: 'failed',
      error: expect.stringContaining('"code":"malformed"'),
      nextImportAt: new Date('2026-11-21T10:30:00Z'),
    });
  });

  it('404s an unknown feed, and queues each due feed once', async () => {
    const { controller, service, repo } = await make({ repo: { exists: jest.fn(async () => false) } });
    await expect(controller.start('3f0c1c56-0000-4000-8000-000000000001')).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.cron()).resolves.toEqual({ queued: 2 });
    await expect(controller.cron()).resolves.toEqual({ queued: 0 });
    await service.idle();
    expect(repo.claim).toHaveBeenCalledTimes(2);
  });
});
