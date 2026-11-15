import { describe, expect, it, jest } from '@jest/globals';

import orderFixture from './__fixtures__/order.json';
import { ShoptetApiError, ShoptetClient } from './client';
import { signShoptetWebhook, verifyShoptetWebhook } from './webhook';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe('ShoptetClient', () => {
  it('sends the private token and parses an order', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(json(orderFixture));
    const client = new ShoptetClient({ privateApiToken: 'tok', fetch: fetchMock });

    const order = await client.getOrder('2026000123');

    expect(order.items[0]?.code).toBe('TRIKO-M');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.myshoptet.com/api/orders/2026000123');
    expect((init!.headers as Record<string, string>)['Shoptet-Private-API-Token']).toBe('tok');
  });

  it('retries 429 using Retry-After', async () => {
    const sleep = jest.fn(async (_ms: number) => {});
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 429, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(json(orderFixture));
    const client = new ShoptetClient({ privateApiToken: 't', fetch: fetchMock, sleep });

    await client.getOrder('2026000123');

    expect(sleep).toHaveBeenCalledWith(2000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws ShoptetApiError with the API errors', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      json({ data: null, errors: [{ errorCode: 'not-found', message: 'Order not found' }] }, 404),
    );
    const client = new ShoptetClient({ privateApiToken: 't', fetch: fetchMock });

    await expect(client.getOrder('x')).rejects.toBeInstanceOf(ShoptetApiError);
  });

  it('walks every page', async () => {
    const page = (n: number) =>
      json({
        data: {
          orders: [{ code: `O${n}`, creationTime: '2026-01-01T00:00:00+0100' }],
          paginator: { totalCount: 2, page: n, pageCount: 2, itemsOnPage: 1, itemsPerPage: 1 },
        },
      });
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page(1))
      .mockResolvedValueOnce(page(2));
    const client = new ShoptetClient({ privateApiToken: 't', fetch: fetchMock });

    const codes: string[] = [];
    for await (const o of client.listOrders()) codes.push(o.code);

    expect(codes).toEqual(['O1', 'O2']);
  });
});

describe('webhook signature', () => {
  it('accepts a correct signature and rejects a tampered body', () => {
    const body = '{"eshopId":1,"event":"order:create"}';
    const sig = signShoptetWebhook(body, 'key');
    expect(verifyShoptetWebhook(body, sig, 'key')).toBe(true);
    expect(verifyShoptetWebhook(body + ' ', sig, 'key')).toBe(false);
    expect(verifyShoptetWebhook(body, undefined, 'key')).toBe(false);
  });
});
