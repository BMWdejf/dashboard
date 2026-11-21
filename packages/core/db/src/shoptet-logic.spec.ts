import { describe, expect, it } from '@jest/globals';

import {
  DEFAULT_SHOPTET_SETTINGS,
  parseShoptetOverrides,
  shoptetOutput,
  shoptetSettingsInput,
} from './shoptet-logic';

const flexi = { title: 'Sony A7 IV', priceGross: '64900', available: '57', category: 'Foto' };

describe('shoptet output', () => {
  it('takes Flexi values and sends available − buffer as stock', () => {
    const out = shoptetOutput(flexi, { ...DEFAULT_SHOPTET_SETTINGS, safetyBuffer: '2' });
    expect(out.title).toEqual({ value: 'Sony A7 IV', overridden: false, conflict: false });
    expect(out.stock.value).toBe('55');
    expect(out.conflicts).toBe(0);
  });

  it('uses own values and counts the ones that differ from Flexi', () => {
    const out = shoptetOutput(flexi, {
      ...DEFAULT_SHOPTET_SETTINGS,
      overrides: { title: 'Sony A7 IV (Full-Frame)', priceGross: '64900.00', category: 'Foto' },
    });
    expect(out.title).toEqual({ value: 'Sony A7 IV (Full-Frame)', overridden: true, conflict: true });
    expect(out.priceGross).toEqual({ value: '64900.00', overridden: true, conflict: false });
    expect(out.conflicts).toBe(1);
  });

  it("doesn't send stock with auto-sync off and no own value, never below zero", () => {
    expect(shoptetOutput(flexi, { ...DEFAULT_SHOPTET_SETTINGS, stockAutoSync: false }).stock.value).toBeNull();
    expect(shoptetOutput({ ...flexi, available: '1' }, { ...DEFAULT_SHOPTET_SETTINGS, safetyBuffer: '3' }).stock.value).toBe('0');
  });
});

describe('validation', () => {
  it('accepts decimal commas and rejects negatives and unknown fields', () => {
    expect(
      shoptetSettingsInput.parse({ overrides: { priceGross: '63 990'.replace(' ', '') }, stockAutoSync: true, safetyBuffer: '2,5' }),
    ).toEqual({ overrides: { priceGross: '63990' }, stockAutoSync: true, safetyBuffer: '2.5' });
    expect(shoptetSettingsInput.safeParse({ overrides: { stock: '-1' }, stockAutoSync: true, safetyBuffer: '0' }).success).toBe(false);
    expect(shoptetSettingsInput.safeParse({ overrides: { color: 'red' }, stockAutoSync: true, safetyBuffer: '0' }).success).toBe(false);
  });

  it('drops broken stored fields', () => {
    expect(parseShoptetOverrides({ title: 'A', stock: 'x', extra: 1 })).toEqual({ title: 'A' });
    expect(parseShoptetOverrides(null)).toEqual({});
  });
});
