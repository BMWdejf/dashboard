import { describe, expect, it, jest } from '@jest/globals';

import {
  addressAllowed,
  checkFeed,
  checkFlexi,
  checkShoptet,
  detectDialect,
  feedCheckInput,
  feedEncoding,
  flexiCheckInput,
  guardedLookup,
  inspectXml,
  networkFailure,
  parseCompanies,
  type CheckDeps,
} from './index';

async function* chunks(...parts: string[]) {
  for (const p of parts) yield p;
}

const fetchError = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: { code } });

function deps(fetchImpl: (url: string | URL, init?: RequestInit) => Promise<Response>, addresses = ['93.184.216.34']): CheckDeps {
  let t = 0;
  return {
    fetch: jest.fn(fetchImpl) as unknown as typeof fetch,
    lookup: async () => addresses,
    now: () => (t += 10),
  };
}

describe('addressAllowed', () => {
  it('blocks loopback, link-local, unspecified and multicast always', () => {
    for (const ip of ['127.0.0.1', '169.254.169.254', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(addressAllowed(ip, true)).toBe(false);
    }
  });

  it('allows private ranges only when asked', () => {
    for (const ip of ['10.0.0.5', '172.16.1.1', '192.168.1.10', 'fd00::1']) {
      expect(addressAllowed(ip, false)).toBe(false);
      expect(addressAllowed(ip, true)).toBe(true);
    }
    expect(addressAllowed('172.32.0.1', false)).toBe(true);
    expect(addressAllowed('2001:4860::8888', false)).toBe(true);
    expect(addressAllowed('8.8.8.8', false)).toBe(true);
  });

  it('sees IPv4 inside IPv6 in every spelling', () => {
    // new URL('http://[::ffff:127.0.0.1]/').hostname is "[::ffff:7f00:1]".
    for (const ip of ['::ffff:7f00:1', '[::ffff:7f00:1]', '::ffff:127.0.0.1', '::ffff:a9fe:a9fe', '0:0:0:0:0:ffff:7f00:1']) {
      expect(addressAllowed(ip, true)).toBe(false);
    }
    expect(addressAllowed('::ffff:c0a8:10a', false)).toBe(false);
    expect(addressAllowed('::ffff:c0a8:10a', true)).toBe(true);
  });

  it('blocks NAT64, 6to4, Teredo, IPv4-compatible and CGNAT', () => {
    for (const ip of ['64:ff9b::7f00:1', '2002:7f00:1::', '2001:0:4136:e378::1', '::7f00:1', '100.64.0.1']) {
      expect(addressAllowed(ip, true)).toBe(false);
    }
  });

  it('refuses anything that is not an IP address', () => {
    expect(addressAllowed('localhost', true)).toBe(false);
    expect(addressAllowed('127.1', true)).toBe(false);
  });
});

describe('guardedLookup', () => {
  type Addr = { address: string; family: number };
  const base = (addrs: Addr[]) =>
    ((_h: string, _o: unknown, cb: (err: NodeJS.ErrnoException | null, a: Addr[]) => void) => cb(null, addrs)) as Parameters<
      typeof guardedLookup
    >[1];
  const call = (lookup: ReturnType<typeof guardedLookup>, all: boolean) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address: unknown; family?: number }>((resolve) =>
      lookup('feed.example.cz', { all }, (err, address, family) => resolve({ err, address, family })),
    );

  it('passes public addresses in both callback shapes', async () => {
    const lookup = guardedLookup(false, base([{ address: '93.184.216.34', family: 4 }]));
    expect(await call(lookup, false)).toEqual({ err: null, address: '93.184.216.34', family: 4 });
    expect((await call(lookup, true)).address).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });

  it('refuses the connection when DNS now answers with an internal address', async () => {
    const lookup = guardedLookup(false, base([{ address: '93.184.216.34', family: 4 }, { address: '::ffff:7f00:1', family: 6 }]));
    const r = await call(lookup, true);
    expect(r.err?.code).toBe('EADDRBLOCKED');
    expect(networkFailure(Object.assign(new TypeError('fetch failed'), { cause: r.err })).code).toBe('blocked');
  });

  it('lets private addresses through only when allowed, loopback never', async () => {
    expect((await call(guardedLookup(true, base([{ address: '10.1.2.3', family: 4 }])), false)).err).toBeNull();
    expect((await call(guardedLookup(false, base([{ address: '10.1.2.3', family: 4 }])), false)).err?.code).toBe('EADDRBLOCKED');
    expect((await call(guardedLookup(true, base([{ address: '127.0.0.1', family: 4 }])), false)).err?.code).toBe('EADDRBLOCKED');
  });
});

describe('networkFailure', () => {
  it('classifies undici causes', () => {
    expect(networkFailure(fetchError('ECONNREFUSED')).code).toBe('refused');
    expect(networkFailure(fetchError('UND_ERR_CONNECT_TIMEOUT')).code).toBe('timeout');
    expect(networkFailure(fetchError('DEPTH_ZERO_SELF_SIGNED_CERT')).code).toBe('tls');
    expect(networkFailure(fetchError('ERR_TLS_CERT_ALTNAME_INVALID')).code).toBe('tls');
    expect(networkFailure(Object.assign(new Error('x'), { name: 'TimeoutError' })).code).toBe('timeout');
    expect(networkFailure(fetchError('EHOSTUNREACH')).code).toBe('unreachable');
  });
});

describe('input schemas', () => {
  it('accepts a bare host and rejects a URL', () => {
    expect(flexiCheckInput.parse({ host: ' Demo.FlexiBee.eu ', port: '5434', user: 'u', password: 'p' })).toEqual({
      host: 'demo.flexibee.eu',
      port: 5434,
      user: 'u',
      password: 'p',
    });
    expect(flexiCheckInput.safeParse({ host: 'https://demo.flexibee.eu', port: 5434, user: 'u', password: 'p' }).success).toBe(false);
    expect(flexiCheckInput.safeParse({ host: 'demo.flexibee.eu', port: 70000, user: 'u', password: 'p' }).success).toBe(false);
  });

  it('takes only http(s) feed URLs', () => {
    expect(feedCheckInput.safeParse({ url: 'https://x.cz/feed.xml' }).success).toBe(true);
    expect(feedCheckInput.safeParse({ url: 'file:///etc/passwd' }).success).toBe(false);
    expect(feedCheckInput.safeParse({ url: 'ftp://x.cz/feed.xml' }).success).toBe(false);
  });
});

describe('parseCompanies', () => {
  it('reads one company or many', () => {
    expect(parseCompanies({ companies: { company: { dbNazev: 'demo', nazev: 'Demo s.r.o.' } } })).toEqual([
      { dbNazev: 'demo', nazev: 'Demo s.r.o.' },
    ]);
    expect(parseCompanies({ companies: { company: [{ dbNazev: 'a' }, { dbNazev: 'b', nazev: 'B' }] } })).toEqual([
      { dbNazev: 'a', nazev: 'a' },
      { dbNazev: 'b', nazev: 'B' },
    ]);
    expect(parseCompanies({ companies: '' })).toEqual([]);
    expect(parseCompanies({ hello: 1 })).toBeNull();
  });
});

describe('checkFlexi', () => {
  const input = { host: 'demo.flexibee.eu', port: 5434, user: 'bot', password: 'secret' };

  it('passes and lists companies with Basic auth', async () => {
    const d = deps(async () => Response.json({ companies: { company: { dbNazev: 'demo', nazev: 'Demo' } } }));
    const r = await checkFlexi(input, d);
    expect(r.ok).toBe(true);
    expect(r.steps.map((s) => [s.key, s.status, s.code])).toEqual([
      ['dns', 'ok', 'resolved'],
      ['connect', 'ok', 'open'],
      ['auth', 'ok', 'authorized'],
    ]);
    expect(r.info).toEqual({ url: 'https://demo.flexibee.eu:5434', companies: [{ dbNazev: 'demo', nazev: 'Demo' }] });
    const [url, init] = (d.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://demo.flexibee.eu:5434/c.json');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('bot:secret').toString('base64')}`);
  });

  it('reports wrong credentials', async () => {
    const r = await checkFlexi(input, deps(async () => new Response('{}', { status: 401 })));
    expect(r.ok).toBe(false);
    expect(r.steps[2]).toMatchObject({ key: 'auth', status: 'failed', code: 'unauthorized' });
  });

  it('reports a closed port or a bad certificate', async () => {
    const refused = await checkFlexi(input, deps(async () => Promise.reject(fetchError('ECONNREFUSED'))));
    expect(refused.steps.map((s) => s.status)).toEqual(['ok', 'failed', 'skipped']);
    expect(refused.steps[1]).toMatchObject({ code: 'refused', params: { port: 5434 } });
    const tls = await checkFlexi(input, deps(async () => Promise.reject(fetchError('SELF_SIGNED_CERT_IN_CHAIN'))));
    expect(tls.steps[1]).toMatchObject({ code: 'tls' });
  });

  it('refuses a LAN server unless private networks are allowed, and never loopback', async () => {
    const ok = async () => Response.json({ companies: { company: [] } });
    const closed = await checkFlexi(input, deps(ok, ['192.168.1.20']));
    expect(closed.steps[0]).toEqual({ key: 'dns', status: 'failed', code: 'blocked' });
    const lan = await checkFlexi(input, { ...deps(ok, ['192.168.1.20']), allowPrivate: true });
    expect(lan.steps[0]!.status).toBe('ok');
    const fetchMock = jest.fn(async () => new Response(''));
    const local = await checkFlexi(input, { ...deps(fetchMock, ['127.0.0.1']), fetch: fetchMock as unknown as typeof fetch, allowPrivate: true });
    expect(local.steps[0]).toMatchObject({ status: 'failed', code: 'blocked' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gives one generic error for a failed LAN connection, so ports cannot be told apart', async () => {
    for (const code of ['ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT', 'DEPTH_ZERO_SELF_SIGNED_CERT']) {
      const r = await checkFlexi(input, { ...deps(async () => Promise.reject(fetchError(code)), ['10.0.0.7']), allowPrivate: true });
      expect(r.steps[1]).toEqual({ key: 'connect', status: 'failed', code: 'unreachable', params: { port: 5434, reason: '—' } });
    }
  });

  it('stays generic with private networks allowed even when DNS gave a public address', async () => {
    // A rebinding DNS can answer public for the "dns" step and private at connect time.
    const r = await checkFlexi(input, { ...deps(async () => Promise.reject(fetchError('ECONNREFUSED'))), allowPrivate: true });
    expect(r.steps[0]).toMatchObject({ status: 'ok' });
    expect(r.steps[1]).toEqual({ key: 'connect', status: 'failed', code: 'unreachable', params: { port: 5434, reason: '—' } });
  });

  it('keeps detailed errors for public servers when private networks are closed', async () => {
    const r = await checkFlexi(input, deps(async () => Promise.reject(fetchError('ECONNREFUSED'))));
    expect(r.steps[1]).toMatchObject({ code: 'refused' });
  });

  it('reports a connection the pinned lookup refused (DNS rebinding)', async () => {
    const r = await checkFlexi(input, deps(async () => Promise.reject(fetchError('EADDRBLOCKED'))));
    expect(r.steps[1]).toEqual({ key: 'connect', status: 'failed', code: 'blocked' });
  });

  it('says when the answer is not from Flexi', async () => {
    const r = await checkFlexi(input, deps(async () => new Response('<html>', { status: 200 })));
    expect(r.steps[2]).toMatchObject({ status: 'failed', code: 'notFlexi' });
  });
});

describe('checkShoptet', () => {
  it('reads the e-shop name', async () => {
    const d = { ...deps(async () => Response.json({ data: { contactInformation: { eshopName: 'Můj obchod', url: 'https://x.cz' } } })), baseUrl: 'https://api.myshoptet.com/' };
    const r = await checkShoptet({ token: '123456-p-abcdef' }, d);
    expect(r.ok).toBe(true);
    expect(r.info).toEqual({ name: 'Můj obchod', url: 'https://x.cz' });
    const [url, init] = (d.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.myshoptet.com/api/eshop');
    expect((init.headers as Record<string, string>)['Shoptet-Private-API-Token']).toBe('123456-p-abcdef');
  });

  it('reports an invalid token', async () => {
    const r = await checkShoptet({ token: '123456-p-abcdef' }, { ...deps(async () => Response.json({}, { status: 401 })), baseUrl: 'https://api' });
    expect(r.steps.map((s) => s.code)).toEqual(['reachable', 'invalidToken', 'skipped']);
  });
});

describe('inspectXml + detectDialect', () => {
  it('recognises Heureka SHOPITEM feeds split across chunks', async () => {
    const x = await inspectXml(chunks('<?xml version="1.0"?><SHOP><SHOPI', 'TEM><ITEM_ID>1</ITEM_ID></SHOPITEM><SHOPITEM/></SHOP>'));
    expect(x.error).toBeNull();
    expect(detectDialect(x)).toEqual({ dialect: 'shopitem', itemElement: 'SHOPITEM', items: 2 });
  });

  it('tells Zboží.cz by its namespace', async () => {
    const x = await inspectXml(chunks('<SHOP xmlns="http://www.zbozi.cz/ns/offer/1.0"><SHOPITEM/></SHOP>'));
    expect(detectDialect(x).dialect).toBe('zbozi');
  });

  it('recognises Google Merchant RSS', async () => {
    const x = await inspectXml(
      chunks('<rss xmlns:g="http://base.google.com/ns/1.0"><channel><title>t</title><item><g:id>1</g:id></item><item/></channel></rss>'),
    );
    expect(detectDialect(x)).toEqual({ dialect: 'google', itemElement: 'item', items: 2 });
  });

  it('falls back to the most repeated element', async () => {
    const x = await inspectXml(chunks('<catalog><products><product/><product/><product/></products></catalog>'));
    expect(detectDialect(x)).toEqual({ dialect: 'custom', itemElement: 'product', items: 3 });
  });

  it('reports where the XML breaks', async () => {
    const x = await inspectXml(chunks('<SHOP>\n<SHOPITEM></SHOP>'));
    expect(x.error).toMatchObject({ line: 2 });
  });
});

describe('feedEncoding', () => {
  it('prefers the XML declaration, then the header', () => {
    const head = new TextEncoder().encode('<?xml version="1.0" encoding="windows-1250"?><a/>');
    expect(feedEncoding('text/xml; charset=utf-8', head)).toBe('windows-1250');
    expect(feedEncoding('text/xml; charset=ISO-8859-2', new Uint8Array())).toBe('iso-8859-2');
    expect(feedEncoding(null, new TextEncoder().encode('<?xml encoding="nonsense"?>'))).toBe('utf-8');
  });
});

describe('checkFeed', () => {
  const xml = '<?xml version="1.0" encoding="utf-8"?><SHOP><SHOPITEM><NAME>Čaj</NAME></SHOPITEM></SHOP>';

  it('validates a public HTTPS feed', async () => {
    const r = await checkFeed({ url: 'https://feeds.example.cz/feed.xml' }, deps(async () => new Response(xml, { headers: { 'content-type': 'text/xml' } })));
    expect(r.ok).toBe(true);
    expect(r.steps.map((s) => s.code)).toEqual(['https', 'wellFormed', 'detected']);
    expect(r.info).toMatchObject({ dialect: 'shopitem', items: 1, root: 'SHOP', encoding: 'utf-8' });
  });

  it('warns about plain HTTP but still checks the XML', async () => {
    const r = await checkFeed({ url: 'http://feeds.example.cz/feed.xml' }, deps(async () => new Response(xml)));
    expect(r.ok).toBe(true);
    expect(r.steps[0]).toMatchObject({ status: 'warn', code: 'noTls' });
  });

  it('refuses private addresses, also after a redirect', async () => {
    const lan = await checkFeed({ url: 'https://intranet.example.cz/f.xml' }, deps(async () => new Response(xml), ['10.0.0.8']));
    expect(lan.steps[0]).toMatchObject({ status: 'failed', code: 'blocked' });

    let call = 0;
    const d: CheckDeps = {
      fetch: (async () => (call++ === 0 ? new Response(null, { status: 302, headers: { location: 'http://metadata.local/' } }) : new Response(xml))) as typeof fetch,
      lookup: async (h) => (h === 'metadata.local' ? ['169.254.169.254'] : ['93.184.216.34']),
    };
    const redirected = await checkFeed({ url: 'https://feeds.example.cz/f.xml' }, d);
    expect(redirected.steps[0]).toMatchObject({ status: 'failed', code: 'blocked' });
    expect(call).toBe(1);
  });

  it('refuses a loopback written as IPv4-mapped IPv6 in the URL', async () => {
    const fetchMock = jest.fn(async () => new Response(xml));
    const d: CheckDeps = { fetch: fetchMock as unknown as typeof fetch, lookup: async () => ['93.184.216.34'] };
    const r = await checkFeed({ url: 'http://[::ffff:127.0.0.1]:8080/feed.xml' }, d);
    expect(r.steps[0]).toMatchObject({ status: 'failed', code: 'blocked' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports HTTP errors and broken XML', async () => {
    const notFound = await checkFeed({ url: 'https://x.cz/f.xml' }, deps(async () => new Response('nope', { status: 404 })));
    expect(notFound.steps[0]).toMatchObject({ code: 'httpStatus', params: { status: 404 } });
    const broken = await checkFeed({ url: 'https://x.cz/f.xml' }, deps(async () => new Response('<SHOP><SHOPITEM></SHOP>')));
    expect(broken.steps[1]).toMatchObject({ status: 'failed', code: 'malformed' });
  });
});
