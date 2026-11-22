import { describe, expect, it } from '@jest/globals';

import {
  buildCenikCreate,
  buildCenikFeedUpdate,
  buildImageLink,
  feedFlexiCreateInput,
  FeedFlexiError,
  feedItemChanges,
  feedVatRate,
  suggestFlexiKod,
  type CenikForFeed,
  type FeedItemForFlexi,
} from './to-flexi';

const ID = '0b1c2d3e-0000-4000-8000-000000000001';

const item = (over: Partial<FeedItemForFlexi> = {}): FeedItemForFlexi => ({
  id: ID,
  kod: '1000',
  nazev: 'kuličky z dutého vlákna 0,5 kg',
  eanKod: null,
  popis: '<p>Náplň</p>',
  kratkyPopis: null,
  cenaBezna: '121.000000',
  szbDph: '21.00',
  dodaciLhuta: '0.00',
  hmotnostNetto: null,
  obrazky: [],
  ...over,
});

const cenik = (over: Partial<CenikForFeed> = {}): CenikForFeed => ({
  flexiId: 42,
  kod: 'KULICKY_Z_DUTEHO_VLAKNA_0_5_KG_1000',
  nazev: 'kuličky z dutého vlákna 0,5 kg',
  eanKod: null,
  popis: '<p>Náplň</p>',
  kratkyPopis: null,
  cenaZaklVcDph: '121.000000',
  typSazbyDph: 'dphZakl',
  dodaciLhuta: '0.00',
  hmotnostNetto: null,
  odkazy: [],
  maHlavniPrilohu: false,
  ...over,
});

const problem = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof FeedFlexiError ? e.problem : 'other';
  }
  return null;
};

describe('suggestFlexiKod', () => {
  it('upper-cases, drops diacritics and joins with "_" plus the supplier code', () => {
    expect(suggestFlexiKod('kuličky z dutého vlákna 0,5 kg', '1000')).toBe('KULICKY_Z_DUTEHO_VLAKNA_0_5_KG_1000');
    expect(suggestFlexiKod('Povlečení', '1003_na')).toBe('POVLECENI_1003_NA');
  });

  it('shortens the name so the whole code fits 64 and keeps the supplier code whole', () => {
    const kod = suggestFlexiKod(
      'Bavlněné povlečení Hvězdná obloha Velikost: Na peřinu 200x220 a 2 polštáře 70x90',
      '1003_NA',
    );
    expect(kod.length).toBeLessThanOrEqual(64);
    expect(kod.endsWith('_1003_NA')).toBe(true);
    expect(kod).not.toMatch(/__/);
  });

  it('falls back to the code alone', () => {
    expect(suggestFlexiKod(null, 'A-1')).toBe('A_1');
    expect(suggestFlexiKod('x', 'K'.repeat(80))).toHaveLength(64);
  });
});

describe('buildCenikCreate', () => {
  it('creates goods with the retail price incl. VAT and the feed ext id', () => {
    expect(buildCenikCreate(item({ eanKod: '8590000000001', hmotnostNetto: '0.5' }), 'KULICKY_1000')).toEqual({
      id: `ext:FEED:${ID}`,
      kod: 'KULICKY_1000',
      nazev: 'kuličky z dutého vlákna 0,5 kg',
      typZasobyK: 'typZasoby.zbozi',
      skladove: 'true',
      typCenyDphK: 'typCeny.sDph',
      typSzbDphK: 'typSzbDph.dphZakl',
      cenaZakl: '121',
      eanKod: '8590000000001',
      popis: '<p>Náplň</p>',
      dodaciLhuta: '0',
      hmotMj: '0.5',
    });
  });

  it('leaves out an EAN longer than Flexi allows', () => {
    expect(buildCenikCreate(item({ eanKod: '1'.repeat(21) }), 'A')).not.toHaveProperty('eanKod');
  });

  it('rejects a bad code, a missing name and an unknown VAT rate', () => {
    expect(problem(() => buildCenikCreate(item(), 'mezera v kódu'))).toBe('kodInvalid');
    expect(problem(() => buildCenikCreate(item(), 'K'.repeat(65)))).toBe('kodInvalid');
    expect(problem(() => buildCenikCreate(item({ nazev: ' ' }), 'A'))).toBe('noName');
    expect(problem(() => buildCenikCreate(item({ szbDph: '19' }), 'A'))).toBe('vatUnknown');
  });
});

describe('feedVatRate', () => {
  it('maps Czech rates', () => {
    expect(['21.00', '12', '10', '0', null, '7'].map(feedVatRate)).toEqual([
      'dphZakl',
      'dphSniz',
      'dphSniz2',
      'dphOsv',
      null,
      null,
    ]);
  });
});

describe('feedItemChanges / buildCenikFeedUpdate', () => {
  it('finds nothing when the product matches the feed', () => {
    expect(feedItemChanges(item(), cenik())).toEqual([]);
  });

  it('lists differing fields but never clears values the feed lacks', () => {
    const changes = feedItemChanges(item({ cenaBezna: '129', popis: null }), cenik({ nazev: 'Jiný název' }));
    expect(changes).toEqual([
      { field: 'nazev', flexi: 'Jiný název', feed: 'kuličky z dutého vlákna 0,5 kg' },
      { field: 'cena', flexi: '121.000000', feed: '129' },
    ]);
  });

  it('writes only the chosen fields, the price with its VAT-inclusive type', () => {
    const r = buildCenikFeedUpdate(item({ cenaBezna: '129' }), cenik({ nazev: 'Jiný' }), ['cena']);
    expect(r).toEqual({ id: '42', typCenyDphK: 'typCeny.sDph', cenaZakl: '129' });
    expect(problem(() => buildCenikFeedUpdate(item(), cenik({ nazev: 'Jiný' }), ['cena']))).toBe('noChanges');
  });
});

describe('feedFlexiCreateInput', () => {
  it('caps a request at 200 items and defaults to a real write', () => {
    const one = { id: ID, kod: 'A' };
    expect(feedFlexiCreateInput.parse({ items: [one] }).check).toBe(false);
    expect(feedFlexiCreateInput.safeParse({ items: Array(201).fill(one) }).success).toBe(false);
  });
});

describe('feed images → link attachments', () => {
  const A = 'https://www.luzkovinysmolka.cz/user/shop/big/1000.jpg?6543';
  const B = 'https://www.luzkovinysmolka.cz/user/shop/big/1000-1.png';

  it('creates a product with its images as link attachments, the first one main', () => {
    const r = buildCenikCreate(item({ obrazky: [A, ' ', 'ftp://x/y.jpg', B, A] }), 'K') as { prilohy: Record<string, string>[] };
    expect(r.prilohy).toEqual([
      expect.objectContaining({ nazSoub: 'www.luzkovinysmolka.cz - 1000.jpg', contentType: 'image/jpeg', link: A, linkPicture: 'true', mainAttachment: 'true' }),
      expect.objectContaining({ nazSoub: 'www.luzkovinysmolka.cz - 1000-1.png', contentType: 'image/png', link: B }),
    ]);
    expect(r.prilohy[1]).not.toHaveProperty('mainAttachment');
    // A stable id per item and URL, so a repeated write updates instead of adding.
    expect(r.prilohy[0]!.id).toMatch(new RegExp(`^ext:FEEDIMG:${ID}:[0-9a-f]{8}$`));
    expect(r.prilohy[0]!.id).toBe((buildCenikCreate(item({ obrazky: [A] }), 'K') as typeof r).prilohy[0]!.id);
    expect(r.prilohy[0]!.id).not.toBe(r.prilohy[1]!.id);
    expect(buildCenikCreate(item(), 'K')).not.toHaveProperty('prilohy');
    // A malformed %-sequence doesn't throw.
    expect(buildImageLink(ID, 'https://x.cz/a%E0%A4%A.jpg', false).nazSoub).toBe('x.cz - a%E0%A4%A.jpg');
  });

  it('adds only the images the product does not link yet, main only if it has none', () => {
    expect(feedItemChanges(item({ obrazky: [A] }), cenik({ odkazy: [A] }))).toEqual([]);
    expect(feedItemChanges(item({ obrazky: [A, B] }), cenik({ odkazy: [A] }))).toEqual([{ field: 'obrazky', flexi: A, feed: B }]);
    const r = buildCenikFeedUpdate(item({ obrazky: [A, B] }), cenik(), ['obrazky']) as { prilohy: Record<string, string>[] };
    expect(r.prilohy.map((p) => [p.link, p.mainAttachment])).toEqual([
      [A, 'true'],
      [B, undefined],
    ]);
    const withMain = buildCenikFeedUpdate(item({ obrazky: [A] }), cenik({ maHlavniPrilohu: true }), ['obrazky']) as typeof r;
    expect(withMain.prilohy[0]).not.toHaveProperty('mainAttachment');
    expect(problem(() => buildCenikFeedUpdate(item({ obrazky: [A] }), cenik({ odkazy: [A] }), ['obrazky']))).toBe('noChanges');
  });
});
