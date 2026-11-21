import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, jest } from '@jest/globals';

import { FlexiApiError } from '@repo/client-flexi';
import type { MirrorFlexiReader, MirrorStore } from '@repo/core-sync';

import { PRODUCT_DEPS, ProductsService, type ProductDeps } from './products.service';

const product = { id: '2', lastUpdate: '', kod: 'BZ_2', nazev: 'BZ 2', typZasobyK: 'typZasoby.zbozi', skladove: 'true' };

function make({ dryRun = true, upsertError, found = true }: { dryRun?: boolean; upsertError?: Error; found?: boolean } = {}) {
  const upsert = jest.fn(async () => {
    if (upsertError) throw upsertError;
    return [];
  });
  const list = jest.fn(async (evidence: string) => ({ rows: evidence === 'cenik' && found ? [product] : [] }));
  const store = {
    upsert: jest.fn(async (_e: string, rows: unknown[]) => ({ written: rows.length, skipped: 0 })),
    refreshStock: jest.fn(async () => 0),
  } as unknown as MirrorStore;
  const deps: ProductDeps = {
    writer: () => ({ upsert, isDryRun: dryRun }),
    sync: () => ({ flexi: { list, changes: jest.fn() } as unknown as MirrorFlexiReader, store }),
  };
  return { deps, upsert, store };
}

async function service(deps: ProductDeps) {
  const mod = await Test.createTestingModule({
    providers: [ProductsService, { provide: PRODUCT_DEPS, useValue: deps }],
  }).compile();
  return mod.get(ProductsService);
}

describe('ProductsService', () => {
  it('sends the change to Flexi and stops there in dry-run', async () => {
    const { deps, upsert, store } = make();
    await expect((await service(deps)).save(2, { nazev: 'Nový' })).resolves.toEqual({ dryRun: true, synced: false });
    expect(upsert).toHaveBeenCalledWith('cenik', [{ id: '2', nazev: 'Nový' }]);
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it('reads the product back into the mirror after a real write', async () => {
    const { deps, store } = make({ dryRun: false });
    await expect((await service(deps)).save(2, { nakupCena: '220.5' })).resolves.toEqual({ dryRun: false, synced: true });
    expect(store.upsert).toHaveBeenCalledWith('cenik', [expect.objectContaining({ flexiId: 2 })]);
  });

  it('turns Flexi validation errors into 422 with the messages', async () => {
    const { deps } = make({
      upsertError: new FlexiApiError(400, ["Zadaný text 'code:X' musí identifikovat objekt [BZ_2]"]),
    });
    const err = await (await service(deps)).save(2, { skupinaKod: 'X' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect((err as UnprocessableEntityException).getResponse()).toMatchObject({
      errors: ["Zadaný text 'code:X' musí identifikovat objekt [BZ_2]"],
    });
  });

  it('404s a product Flexi does not have', async () => {
    const { deps } = make({ found: false });
    await expect((await service(deps)).sync(2)).rejects.toBeInstanceOf(NotFoundException);
  });
});
