import { describe, expect, it } from '@jest/globals';
import { order as orderSchema, type ShoptetOrder } from '@repo/client-shoptet';

import { MappingError, mapShoptetOrderToFlexi, toFlexiDate } from './orders';

const base = (): ShoptetOrder =>
  orderSchema.parse({
    code: '2026000123',
    creationTime: '2026-11-10T09:15:00+0100',
    email: 'zakaznik@example.com',
    billingAddress: {
      fullName: 'Jana Nováková',
      street: 'Dlouhá',
      houseNumber: '12',
      city: 'Brno',
      zip: '60200',
      countryCode: 'CZ',
    },
    price: { withVat: '684.00', currencyCode: 'CZK' },
    items: [
      {
        itemType: 'product',
        code: 'TRIKO-M',
        name: 'Tričko M',
        amount: '2.000',
        amountUnit: 'ks',
        itemPrice: { withVat: '302.50', withoutVat: '250.00', vatRate: '21.00' },
      },
      {
        itemType: 'shipping',
        name: 'Zásilkovna',
        amount: '1',
        itemPrice: { withVat: '79.00', withoutVat: '65.29', vatRate: '21.00' },
      },
      {
        itemType: 'discount-coupon',
        name: 'Sleva',
        amount: '1',
        itemPrice: { withVat: '-50.00', withoutVat: '-41.32', vatRate: '21.00' },
      },
    ],
  });

describe('mapShoptetOrderToFlexi', () => {
  it('maps header, address and lines with an ext id', () => {
    const r = mapShoptetOrderToFlexi(base(), { documentType: 'code:OBP', linkPriceList: true });

    expect(r).toMatchObject({
      id: 'ext:SHOPTET:order:2026000123',
      typDokl: 'code:OBP',
      cisObj: '2026000123',
      datVyst: '2026-11-10',
      nazFirmy: 'Jana Nováková',
      ulice: 'Dlouhá 12',
      mesto: 'Brno',
      psc: '60200',
      stat: 'code:CZ',
      mena: 'code:CZK',
    });
    expect(r.polozkyObchDokladu).toEqual([
      {
        nazev: 'Tričko M',
        kod: 'TRIKO-M',
        mnozMj: 2,
        mj: 'code:KS',
        cenaMj: 250,
        szbDph: 21,
        typCenyDphK: 'typCeny.bezDph',
        cenik: 'code:TRIKO-M',
      },
      { nazev: 'Zásilkovna', mnozMj: 1, cenaMj: 65.29, szbDph: 21, typCenyDphK: 'typCeny.bezDph' },
    ]);
  });

  it('prefers the company name for B2B orders', () => {
    const o = base();
    o.billingAddress = { ...o.billingAddress, company: 'Firma s.r.o.', companyId: '12345678' };
    const r = mapShoptetOrderToFlexi(o);
    expect(r.nazFirmy).toBe('Firma s.r.o.');
    expect(r.ic).toBe('12345678');
  });

  it('rejects an order with a non-numeric price', () => {
    const o = base();
    o.items[0]!.itemPrice.withoutVat = 'abc';
    expect(() => mapShoptetOrderToFlexi(o)).toThrow(MappingError);
  });

  it('rejects an order without a billing name', () => {
    const o = base();
    o.billingAddress = null;
    expect(() => mapShoptetOrderToFlexi(o)).toThrow(/billing address/);
  });
});

describe('toFlexiDate', () => {
  it('keeps the local date', () => {
    expect(toFlexiDate('2026-12-31T23:30:00+0100')).toBe('2026-12-31');
  });
});
