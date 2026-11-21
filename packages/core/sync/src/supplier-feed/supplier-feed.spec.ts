import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, jest } from '@jest/globals';

import type { CheckDeps } from '../checks/types';
import {
  attributeName,
  defaultFeedMapping,
  FeedReadError,
  importSupplierFeed,
  mapFeedItem,
  nextImportAt,
  parseDecimal,
  parseFeedItems,
  previewSupplierFeed,
  sampleText,
  supplierFeedInput,
  validateFeedMapping,
  type FeedMapping,
  type FeedRecord,
  type SupplierFeedItemRow,
  type SupplierFeedStore,
} from './index';

const HEUREKA = readFileSync(join(__dirname, 'fixtures/heureka.xml'), 'utf8');

async function* chunks(text: string, size = 97) {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

async function parseAll(xml: string, element = 'SHOPITEM') {
  const items: FeedRecord[] = [];
  await parseFeedItems(chunks(xml), element, (r) => items.push(r));
  return items;
}

function deps(body: string, init: { status?: number; headers?: Record<string, string> } = {}): CheckDeps {
  let t = 0;
  return {
    fetch: jest.fn(async () => new Response(body, { status: init.status ?? 200, headers: init.headers })) as unknown as typeof fetch,
    lookup: async () => ['93.184.216.34'],
    now: () => (t += 5),
  };
}

const URL_ = 'https://dodavatel.example/heureka.xml';

describe('parseFeedItems', () => {
  it('flattens each item: paths, repeats, PARAM pairs, CDATA', async () => {
    const [first] = await parseAll(HEUREKA);
    expect(first!.ITEM_ID).toEqual(['142']);
    expect(first!.IMGURL_ALTERNATIVE).toEqual(['https://cdn.example/142-1.jpg', 'https://cdn.example/142-2.jpg']);
    expect(first!['PARAM[Velikost]']).toEqual(['220x200']);
    expect(first!['PARAM[Barva]']).toEqual(['bílá']);
    expect(first!['DELIVERY/DELIVERY_ID']).toEqual(['GLS']);
    expect(first!.DESCRIPTION![0]).toContain('<strong>Prodyšný</strong>');
    expect(first!.PARAM).toBeUndefined();
  });

  it('groups PARAM names ignoring case, first spelling wins', async () => {
    const items = await parseAll(HEUREKA);
    expect(items[1]!['PARAM[Velikost]']).toEqual(['70x90']);
    expect(Object.keys(items[1]!).some((k) => k === 'PARAM[velikost]')).toBe(false);
  });

  it('matches the item element ignoring case and keeps its attributes', async () => {
    const items = await parseAll('<rss><channel><item id="7"><title>A</title></item><item><title>B</title></item></channel></rss>', 'ITEM');
    expect(items).toEqual([{ '@id': ['7'], title: ['A'] }, { title: ['B'] }]);
  });

  it('handles self-closing elements', async () => {
    const items = await parseAll('<SHOP><SHOPITEM><ITEM_ID>1</ITEM_ID><EAN/></SHOPITEM></SHOP>');
    expect(items).toEqual([{ ITEM_ID: ['1'], EAN: [''] }]);
  });

  it('stops an item that nests too deep or has too many values', async () => {
    const deep = `<SHOP><SHOPITEM>${'<a>'.repeat(20)}x${'</a>'.repeat(20)}</SHOPITEM></SHOP>`;
    await expect(parseAll(deep)).rejects.toMatchObject({ code: 'tooComplex' });
    const wide = `<SHOP><SHOPITEM><ITEM_ID>1</ITEM_ID>${'<A>x</A>'.repeat(6_000)}</SHOPITEM></SHOP>`;
    await expect(parseAll(wide)).rejects.toMatchObject({ code: 'tooComplex' });
    const params = `<SHOP><SHOPITEM>${'<PARAM><PARAM_NAME>B</PARAM_NAME><VAL>c</VAL></PARAM>'.repeat(3_000)}</SHOPITEM></SHOP>`;
    await expect(parseAll(params)).resolves.toHaveLength(1);
  });

  it('throws malformed with the line, and noItems when nothing matches', async () => {
    await expect(parseAll('<SHOP><SHOPITEM><A>1</B></SHOPITEM></SHOP>')).rejects.toMatchObject({ code: 'malformed' });
    await expect(parseAll('<SHOP><X/></SHOP>')).rejects.toMatchObject({ code: 'noItems' });
  });
});

describe('defaultFeedMapping', () => {
  it('maps the Heureka tags and every PARAM as an attribute', () => {
    const tags = [
      'ITEM_ID',
      'PRODUCTNAME',
      'PRODUCT',
      'DESCRIPTION',
      'URL',
      'IMGURL',
      'IMGURL_ALTERNATIVE',
      'PRICE_VAT',
      'VAT',
      'CATEGORYTEXT',
      'ITEMGROUP_ID',
      'PARAM[Barva]',
      'DELIVERY_DATE',
      'DELIVERY/DELIVERY_ID',
      'ACCESSORY',
    ];
    expect(defaultFeedMapping(tags)).toEqual({
      ITEM_ID: 'kod',
      PRODUCTNAME: 'nazev',
      DESCRIPTION: 'popis',
      URL: 'url',
      IMGURL: 'obrazky',
      IMGURL_ALTERNATIVE: 'obrazky',
      PRICE_VAT: 'cenaBezna',
      VAT: 'szbDph',
      CATEGORYTEXT: 'kategorie',
      ITEMGROUP_ID: 'skupinaVariant',
      'PARAM[Barva]': 'atribut',
      DELIVERY_DATE: 'dodaciLhuta',
    });
  });

  it('maps Google Merchant tags without the g: prefix', () => {
    expect(defaultFeedMapping(['g:id', 'g:title', 'g:price', 'g:gtin', 'g:brand', 'g:image_link'])).toEqual({
      'g:id': 'kod',
      'g:title': 'nazev',
      'g:price': 'cenaBezna',
      'g:gtin': 'eanKod',
      'g:brand': 'vyrobce',
      'g:image_link': 'obrazky',
    });
  });
});

describe('validateFeedMapping', () => {
  it('needs a key and a name', () => {
    expect(validateFeedMapping({ PRICE_VAT: 'cenaBezna' })).toEqual([
      { code: 'missing', target: 'kod' },
      { code: 'missing', target: 'nazev' },
    ]);
  });

  it('allows several tags only for images and attributes', () => {
    const m: FeedMapping = {
      ITEM_ID: 'kod',
      PRODUCTNAME: 'nazev',
      PRODUCT: 'nazev',
      IMGURL: 'obrazky',
      IMGURL_ALTERNATIVE: 'obrazky',
      'PARAM[A]': 'atribut',
      'PARAM[B]': 'atribut',
    };
    expect(validateFeedMapping(m)).toEqual([{ code: 'duplicate', target: 'nazev', tags: ['PRODUCTNAME', 'PRODUCT'] }]);
  });

  it('reports tags the feed does not have', () => {
    expect(validateFeedMapping({ ITEM_ID: 'kod', NAME: 'nazev' }, ['ITEM_ID'])).toEqual([{ code: 'unknownTag', tag: 'NAME' }]);
  });
});

describe('parseDecimal', () => {
  it.each([
    ['489,00', '489.00'],
    ['1 299,50', '1299.50'],
    ['1\u00a0299,50 Kč', '1299.50'],
    ['1,234.50', '1234.50'],
    ['1.234,50', '1234.50'],
    ['63990.00', '63990.00'],
    ['1,000,000', '1000000'],
    ['-5', '-5'],
    ['21', '21'],
  ])('%s → %s', (input, out) => expect(parseDecimal(input)).toBe(out));

  it.each(['na dotaz', '', '1.2.3,4,5', '123456789012345'])('%s → null', (input) => expect(parseDecimal(input)).toBeNull());
});

describe('mapFeedItem', () => {
  it('fills the columns and keeps unmapped tags in raw', async () => {
    const [first] = await parseAll(HEUREKA);
    const mapping = defaultFeedMapping(Object.keys(first!));
    const m = mapFeedItem(first!, mapping);
    expect(m).toMatchObject({ ok: true, invalid: [] });
    const row = (m as { row: SupplierFeedItemRow }).row;
    expect(row).toMatchObject({
      kod: '142',
      nazev: 'Nepropustný chránič 220x200 cm',
      cenaBezna: '489.00',
      szbDph: '21',
      dodaciLhuta: '0',
      kategorie: 'Chrániče matrací',
      url: 'https://dodavatel.example/chranic-220/',
      skupinaVariant: '142',
      obrazky: ['https://cdn.example/142-0.jpg', 'https://cdn.example/142-1.jpg', 'https://cdn.example/142-2.jpg'],
      atributy: { Velikost: '220x200', Barva: 'bílá' },
    });
    expect(row.popis).toContain('<strong>');
    expect(row.raw).toEqual({
      PRODUCT: ['Nepropustný chránič 220x200 cm'],
      'DELIVERY/DELIVERY_ID': ['GLS'],
      'DELIVERY/DELIVERY_PRICE': ['115,00'],
      ACCESSORY: ['145', '148'],
    });
  });

  it('rejects an item without a key and nulls invalid values', () => {
    expect(mapFeedItem({ PRODUCTNAME: ['X'] }, { ITEM_ID: 'kod', PRODUCTNAME: 'nazev' })).toEqual({ ok: false, reason: 'noKey' });
    const m = mapFeedItem(
      { ITEM_ID: ['1'], PRICE_VAT: ['na dotaz'], URL: ['javascript:alert(1)'], VAT: ['2100%'] },
      { ITEM_ID: 'kod', PRICE_VAT: 'cenaBezna', URL: 'url', VAT: 'szbDph' },
    );
    expect(m).toMatchObject({ ok: true, row: { cenaBezna: null, url: null, szbDph: null } });
    expect((m as { invalid: string[] }).invalid.sort()).toEqual(['cenaBezna', 'szbDph', 'url']);
  });

  it('cuts text to the column length and collapses whitespace', () => {
    const m = mapFeedItem({ ID: ['  a\n  b '], N: ['x'.repeat(300)] }, { ID: 'kod', N: 'nazev' });
    expect(m).toMatchObject({ ok: true, row: { kod: 'a b' } });
    expect((m as { row: SupplierFeedItemRow }).row.nazev).toHaveLength(255);
  });
});

describe('previewSupplierFeed', () => {
  it('lists tags with counts and samples, and a suggested mapping', async () => {
    const p = await previewSupplierFeed({ url: URL_, itemElement: 'SHOPITEM' }, deps(HEUREKA));
    expect(p.items).toBe(4);
    expect(p.tags.find((t) => t.tag === 'ITEM_ID')).toEqual({ tag: 'ITEM_ID', items: 3, sample: '142' });
    expect(p.tags.find((t) => t.tag === 'DESCRIPTION')?.sample).toBe('Prodyšný chránič matrace');
    expect(p.mapping.ITEM_ID).toBe('kod');
    expect(p.mapping['PARAM[Velikost]']).toBe('atribut');
  });

  it('fails with the check code when the feed is unreachable', async () => {
    await expect(previewSupplierFeed({ url: URL_, itemElement: 'SHOPITEM' }, deps('', { status: 404 }))).rejects.toEqual(
      new FeedReadError({ code: 'httpStatus', params: { status: 404 } }),
    );
  });

  it('refuses a feed on a private address', async () => {
    const d = { ...deps(HEUREKA), lookup: async () => ['10.0.0.5'] };
    await expect(previewSupplierFeed({ url: URL_, itemElement: 'SHOPITEM' }, d)).rejects.toMatchObject({
      failure: { code: 'blocked' },
    });
    expect(d.fetch).not.toHaveBeenCalled();
  });
});

describe('importSupplierFeed', () => {
  const mapping: FeedMapping = { ITEM_ID: 'kod', PRODUCTNAME: 'nazev', PRICE_VAT: 'cenaBezna', 'PARAM[Velikost]': 'atribut' };

  it('writes unique rows and counts what it skipped', async () => {
    const replaceItems = jest.fn<SupplierFeedStore['replaceItems']>(async (_id, rows) => ({ written: rows.length, removed: 2 }));
    const stats = await importSupplierFeed(
      { id: 'feed-1', url: URL_, itemElement: 'SHOPITEM', mapping },
      { ...deps(HEUREKA), store: { replaceItems } },
    );
    const [feedId, rows] = replaceItems.mock.calls[0]!;
    expect(feedId).toBe('feed-1');
    expect(rows.map((r) => [r.kod, r.cenaBezna, r.atributy])).toEqual([
      ['142', '489.00', { Velikost: '220x200' }],
      ['145', '1299.50', { Velikost: '70x90' }],
    ]);
    expect(stats).toMatchObject({ items: 4, written: 2, removed: 2, noKey: 1, duplicates: 1, invalid: {} });
  });

  it('writes nothing when the feed is broken part-way', async () => {
    const replaceItems = jest.fn<SupplierFeedStore['replaceItems']>();
    const broken = HEUREKA.slice(0, HEUREKA.indexOf('<SHOPITEM>', 100)) + '<SHOPITEM><ITEM_ID>9</SHOP>';
    await expect(
      importSupplierFeed({ id: 'f', url: URL_, itemElement: 'SHOPITEM', mapping }, { ...deps(broken), store: { replaceItems } }),
    ).rejects.toMatchObject({ failure: { code: 'malformed' } });
    expect(replaceItems).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('attributeName', () => {
    expect(attributeName('PARAM[Barva]')).toBe('Barva');
    expect(attributeName('DELIVERY/DELIVERY_ID')).toBe('DELIVERY_ID');
    expect(attributeName('@id')).toBe('id');
  });

  it('sampleText strips HTML and shortens', () => {
    expect(sampleText('<p>a&nbsp;<b>b</b></p>')).toBe('a b');
    expect(sampleText('x'.repeat(200))).toHaveLength(118);
  });

  it('nextImportAt', () => {
    const at = new Date('2026-11-21T10:00:00Z');
    expect(nextImportAt(60, at)).toEqual(new Date('2026-11-21T11:00:00Z'));
    expect(nextImportAt(null, at)).toBeNull();
  });

  it('supplierFeedInput accepts only the offered intervals', () => {
    const base = { url: URL_, name: 'Dodavatel', dialect: 'shopitem', itemElement: 'SHOPITEM', mapping: { ITEM_ID: 'kod' } };
    expect(supplierFeedInput.safeParse({ ...base, importIntervalMinutes: 360 }).success).toBe(true);
    expect(supplierFeedInput.safeParse({ ...base, importIntervalMinutes: null }).success).toBe(true);
    expect(supplierFeedInput.safeParse({ ...base, importIntervalMinutes: 5 }).success).toBe(false);
    expect(supplierFeedInput.safeParse({ ...base, itemElement: 'a b', importIntervalMinutes: null }).success).toBe(false);
  });
});
