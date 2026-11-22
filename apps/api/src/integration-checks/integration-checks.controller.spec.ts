import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, jest } from '@jest/globals';

import { IntegrationChecksController } from './integration-checks.controller';
import { CHECK_DEPS, IntegrationChecksService, type IntegrationCheckDeps } from './integration-checks.service';

async function make(fetchImpl: (url: string | URL, init?: RequestInit) => Promise<Response>) {
  const fetchMock = jest.fn(fetchImpl);
  const deps: IntegrationCheckDeps = {
    fetch: fetchMock as unknown as typeof fetch,
    flexiFetch: fetchMock as unknown as typeof fetch,
    lookup: async () => ['93.184.216.34'],
    shoptetBaseUrl: 'https://api.myshoptet.com',
  };
  const mod = await Test.createTestingModule({
    controllers: [IntegrationChecksController],
    providers: [IntegrationChecksService, { provide: CHECK_DEPS, useValue: deps }],
  })
    .overrideGuard((await import('../flexi-sync/sync-token.guard')).SyncTokenGuard)
    .useValue({ canActivate: () => true })
    .compile();
  return { controller: mod.get(IntegrationChecksController), fetchMock };
}

describe('IntegrationChecksController', () => {
  it('rejects invalid input without echoing it', async () => {
    const { controller, fetchMock } = await make(async () => new Response(''));
    let error: unknown;
    try {
      controller.flexi({ host: 'https://x', port: 1, user: 'u', password: 'hunter2' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    expect(JSON.stringify((error as BadRequestException).getResponse())).not.toContain('hunter2');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('runs the Flexi check', async () => {
    const { controller } = await make(async () => Response.json({ companies: { company: { dbNazev: 'demo' } } }));
    const r = await controller.flexi({ host: 'demo.flexibee.eu', port: 5434, user: 'u', password: 'p' });
    expect(r.ok).toBe(true);
    expect(r.info?.companies).toEqual([{ dbNazev: 'demo', nazev: 'demo' }]);
  });

  it('runs the feed check', async () => {
    const { controller } = await make(async () => new Response('<SHOP><SHOPITEM/></SHOP>'));
    const r = await controller.feed({ url: 'https://feeds.example.cz/f.xml' });
    expect(r.info).toMatchObject({ dialect: 'shopitem', items: 1 });
  });

  it('runs the Shoptet check against the configured API', async () => {
    const { controller, fetchMock } = await make(async () => Response.json({ data: { name: 'Shop' } }));
    const r = await controller.shoptet({ token: '123456-p-abcdef' });
    expect(r.info).toEqual({ name: 'Shop', url: null });
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.myshoptet.com/api/eshop');
  });
});
