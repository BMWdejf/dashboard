import { z } from 'zod';

import {
  envelope,
  order,
  orderSummary,
  paginator,
  product,
  type ShoptetOrder,
  type ShoptetOrderSummary,
  type ShoptetProduct,
} from './schemas';

export interface ShoptetClientOptions {
  /** e.g. https://api.myshoptet.com */
  baseUrl?: string;
  /** Private API token of our own e-shop (header Shoptet-Private-API-Token). */
  privateApiToken?: string;
  /** OAuth access token of an addon installation (header Shoptet-Access-Token). */
  accessToken?: string;
  fetch?: typeof fetch;
  /** How many times a 429 / 503 is retried before giving up. */
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class ShoptetApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly errors: { errorCode: string; message: string }[],
    public readonly requestId?: string,
  ) {
    super(
      `Shoptet API ${status}: ${errors.map((e) => `${e.errorCode} ${e.message}`).join('; ') || 'request failed'}`,
    );
    this.name = 'ShoptetApiError';
  }
}

type Query = Record<string, string | number | boolean | undefined>;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class ShoptetClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: ShoptetClientOptions) {
    if (!opts.privateApiToken && !opts.accessToken) {
      throw new Error('ShoptetClient needs privateApiToken or accessToken');
    }
    this.baseUrl = (opts.baseUrl ?? 'https://api.myshoptet.com').replace(/\/$/, '');
    this.headers = {
      Accept: 'application/json',
      'Content-Type': 'application/vnd.shoptet.v1.0',
      ...(opts.privateApiToken
        ? { 'Shoptet-Private-API-Token': opts.privateApiToken }
        : { 'Shoptet-Access-Token': opts.accessToken as string }),
    };
    this.fetchImpl = opts.fetch ?? fetch;
    this.maxRetries = opts.maxRetries ?? 5;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  /** Low-level request: parses the {data, errors, metadata} envelope with `schema`. */
  async request<T extends z.ZodType>(
    method: string,
    path: string,
    schema: T,
    opts: { query?: Query; body?: unknown } = {},
  ): Promise<z.infer<T>> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchImpl(url, {
        method,
        headers: this.headers,
        body: opts.body === undefined ? undefined : JSON.stringify({ data: opts.body }),
      });

      if ((res.status === 429 || res.status === 503) && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get('Retry-After'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(30_000, 500 * 2 ** attempt);
        await this.sleep(waitMs);
        continue;
      }

      const json: unknown = await res.json().catch(() => ({}));
      const env = envelope(z.unknown()).safeParse(json);
      const errors = env.success ? (env.data.errors ?? []) : [];
      const requestId = env.success ? env.data.metadata?.requestId : undefined;
      if (!res.ok || !env.success || env.data.data == null) {
        throw new ShoptetApiError(res.status, errors, requestId);
      }
      const data = schema.safeParse(env.data.data);
      if (!data.success) {
        throw new ShoptetApiError(res.status, [
          { errorCode: 'invalid-response', message: data.error.message },
        ], requestId);
      }
      return data.data;
    }
  }

  /** Iterate every item of a paginated list endpoint. */
  async *paginate<T extends z.ZodType>(
    path: string,
    key: string,
    item: T,
    query: Query = {},
    itemsPerPage = 50,
  ): AsyncGenerator<z.infer<T>> {
    const pageSchema = z.object({ [key]: z.array(item), paginator });
    for (let page = 1; ; page++) {
      const data = (await this.request('GET', path, pageSchema, {
        query: { ...query, page, itemsPerPage },
      })) as Record<string, unknown> & { paginator: { pageCount: number } };
      for (const it of data[key] as z.infer<T>[]) yield it;
      if (page >= data.paginator.pageCount) return;
    }
  }

  listOrders(query: Query = {}): AsyncGenerator<ShoptetOrderSummary> {
    return this.paginate('/api/orders', 'orders', orderSummary, query);
  }

  async getOrder(code: string): Promise<ShoptetOrder> {
    const data = await this.request(
      'GET',
      `/api/orders/${encodeURIComponent(code)}`,
      z.object({ order }),
    );
    return data.order;
  }

  listProducts(query: Query = {}): AsyncGenerator<ShoptetProduct> {
    return this.paginate('/api/products', 'products', product, query);
  }
}
