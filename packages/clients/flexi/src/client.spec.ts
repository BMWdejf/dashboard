import { describe, expect, it, jest } from '@jest/globals';

import { FlexiApiError, FlexiClient } from './client';
import { code, idPath, shoptetExtId } from './ids';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const make = (fetchMock: typeof fetch, dryRun?: boolean) =>
  new FlexiClient({
    url: 'https://flexi.example.com:5434/',
    company: 'demo_sro',
    user: 'api',
    password: 'secret',
    dryRun,
    fetch: fetchMock,
  });

describe('ids', () => {
  it('combines several identifiers', () => {
    expect(idPath([code('CZK'), shoptetExtId('order', '1')])).toBe(
      '[code%3ACZK][ext%3ASHOPTET%3Aorder%3A1]',
    );
  });
});

describe('FlexiClient', () => {
  it('lists with filter, paging and basic auth', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      json({ winstrom: { '@rowCount': '1', adresar: [{ id: '7', kod: 'NOVAK' }] } }),
    );
    const { rows, rowCount } = await make(fetchMock).list('adresar', {
      filter: "kod='NOVAK'",
      limit: 10,
    });

    expect(rows).toEqual([{ id: '7', kod: 'NOVAK' }]);
    expect(rowCount).toBe(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://flexi.example.com:5434/c/demo_sro/adresar/(kod%3D\'NOVAK\').json?add-row-count=true&limit=10',
    );
    expect((init!.headers as Record<string, string>).Authorization).toBe(
      'Basic ' + Buffer.from('api:secret').toString('base64'),
    );
  });

  it('writes in dry-run mode by default', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(json({ winstrom: { success: 'true', results: [{ id: '1' }] } }));
    await make(fetchMock).upsert('adresar', [{ id: 'ext:SHOPTET:customer:1', nazev: 'X' }]);

    expect(String(fetchMock.mock.calls[0]![0])).toContain('dry-run=true');
  });

  it('writes for real only when dry-run is off', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(json({ winstrom: { success: 'true', results: [] } }));
    await make(fetchMock, false).upsert('adresar', [{ nazev: 'X' }]);

    expect(String(fetchMock.mock.calls[0]![0])).not.toContain('dry-run');
  });

  it('surfaces validation errors', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      json(
        {
          winstrom: {
            success: 'false',
            results: [{ errors: [{ message: 'Pole "nazev" je povinné.' }] }],
          },
        },
        400,
      ),
    );

    await expect(make(fetchMock).upsert('adresar', [{}])).rejects.toThrow(
      new FlexiApiError(400, ['Pole "nazev" je povinné.']),
    );
  });

  it('returns undefined for a missing record', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(json({}, 404));
    expect(await make(fetchMock).get('cenik', code('NEEXISTUJE'))).toBeUndefined();
  });

  it('reads the Changes API with its version cursor', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      json({
        winstrom: {
          '@globalVersion': '1008522',
          changes: [{ '@evidence': 'cenik', '@in-version': '2126', '@operation': 'delete', id: '164' }],
          next: '2127',
        },
      }),
    );
    const res = await make(fetchMock).changes({ start: 2000, limit: 100 });
    expect(res).toEqual({
      changes: [{ '@evidence': 'cenik', '@in-version': '2126', '@operation': 'delete', id: '164' }],
      globalVersion: 1008522,
      next: 2127,
    });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'https://flexi.example.com:5434/c/demo_sro/changes.json?start=2000&limit=100',
    );
  });

  it('sends its own User-Agent', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(json({ winstrom: { sklad: [] } }));
    await make(fetchMock).list('sklad');
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('dashboard-flexi-client/0.1');
  });

  it('treats next=none as the end of the changelog', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(json({ winstrom: { '@globalVersion': '5', changes: [], next: 'none' } }));
    expect((await make(fetchMock).changes()).next).toBeUndefined();
  });
});
