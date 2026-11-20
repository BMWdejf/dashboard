import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { MIRROR_EVIDENCES } from './evidences';
import {
  date,
  dec,
  labels,
  mapRecord,
  mapRecords,
  MirrorMappingError,
  refId,
  selectKey,
  str,
  timestamp,
  type FlexiRecord,
} from './map';

/** Real records from the public demo company (demo.flexibee.eu, 11/2026). */
const demo = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/demo-records.json'), 'utf8'),
) as Record<string, FlexiRecord[]>;

const byId = (evidence: string, id: string) => demo[evidence]!.find((r) => r.id === id)!;

describe('value parsers', () => {
  it('keeps decimals as strings and turns "" into null', () => {
    expect(dec('269.0193')).toBe('269.0193');
    expect(dec('')).toBeNull();
    expect(() => dec('12,5')).toThrow('not a number');
  });

  it('strips the select prefix', () => {
    expect(selectKey('typZasoby.zbozi')).toBe('zbozi');
    expect(selectKey('')).toBeNull();
  });

  it('reads the internal id of a reference from @ref', () => {
    expect(refId({ skupZboz: 'code:DÁV', 'skupZboz@ref': '/c/demo/skupina-zbozi/18.json' }, 'skupZboz')).toBe(18);
    expect(refId({ skupZboz: '' }, 'skupZboz')).toBeNull();
  });

  it('parses dates and timestamps with offsets', () => {
    expect(date('2016-01-01+01:00')).toBe('2016-01-01');
    expect(timestamp('2026-10-23T15:20:11.490+02:00')?.toISOString()).toBe('2026-10-23T13:20:11.490Z');
  });

  it('keeps codes exactly as Flexi sends them', () => {
    expect(str('\ufeffЦБ-3-7-7')).toBe('\ufeffЦБ-3-7-7');
    expect(str('  ')).toBeNull();
  });

  it('splits labels', () => {
    expect(labels('BAT, AHOJ, B2B')).toEqual(['BAT', 'AHOJ', 'B2B']);
    expect(labels('')).toEqual([]);
  });
});

describe('mapRecord on demo data', () => {
  it('maps every fixture record without errors', () => {
    for (const evidence of MIRROR_EVIDENCES) {
      const { rows, errors } = mapRecords(evidence, demo[evidence]!);
      expect(errors).toEqual([]);
      expect(rows.length).toBe(demo[evidence]!.length);
    }
  });

  it('maps a product', () => {
    const row = mapRecord('cenik', byId('cenik', '581'));
    expect(row).toMatchObject({
      flexiId: 581,
      kod: 'AAA',
      nazev: 'huiltr',
      eanKod: 'SP 4820',
      typZasoby: 'zbozi',
      skladove: true,
      exportNaEshop: true,
      skupinaZboziFlexiId: 18,
      mj1FlexiId: 19,
      stitky: ['BAT', 'AHOJ', 'B2B'],
      platiOdRok: 0,
      platiDoRok: 9999,
      typCenyDph: 'bezDph',
      typSazbyDph: 'dphZakl',
      szbDph: '21.0',
      cenaZaklBezDph: '222.33',
      cenaZaklVcDph: '269.0193',
      sumStavMj: '0.0',
      flexiCreatedAt: null,
      dodaciLhuta: null,
      mjHmotnostiFlexiId: null,
    });
    expect(row.raw).not.toHaveProperty('skupZboz@showAs');
    expect(row.raw.kod).toBe('AAA');
  });

  it('maps a stock card with its three references', () => {
    const rec = demo['skladova-karta']![0]!;
    const row = mapRecord('skladova-karta', rec);
    expect(row.cenikFlexiId).toBe(refId(rec, 'cenik'));
    expect(row.skladFlexiId).toBe(refId(rec, 'sklad'));
    expect(row.ucetniObdobiFlexiId).toBe(refId(rec, 'ucetObdobi'));
    expect(row.stavMj).toMatch(/^-?\d+(\.\d+)?$/);
  });

  it('ignores valInteger of a text attribute', () => {
    const row = mapRecord('atribut', byId('atribut', '1'));
    expect(row).toMatchObject({ hodnota: 'L', valNumeric: null, typAtributuFlexiId: 81, cenikFlexiId: 319 });
  });

  it('maps an attachment', () => {
    expect(mapRecord('priloha', byId('priloha', '14'))).toMatchObject({
      cenikFlexiId: 164,
      nazevSouboru: '132350_2.jpg',
      typ: 'obrazek',
      dataSize: 226119,
      hlavni: true,
      odkaz: null,
    });
  });

  it('maps a period to calendar dates', () => {
    expect(mapRecord('ucetni-obdobi', byId('ucetni-obdobi', '24'))).toMatchObject({
      kod: '2016',
      platiOd: '2016-01-01',
      platiDo: '2016-12-31',
    });
  });

  it('reports a broken record with evidence and id, and keeps the rest', () => {
    const good = byId('cenik', '581');
    const { rows, errors } = mapRecords('cenik', [good, { ...good, id: '9', nazev: '' }]);
    expect(rows).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(MirrorMappingError);
    expect(errors[0]!.message).toBe('cenik 9: missing nazev');
  });
});
