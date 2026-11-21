import { getDb } from './client';
import {
  DEFAULT_SHOPTET_SETTINGS,
  parseShoptetOverrides,
  type ShoptetSettings,
  type ShoptetSettingsInput,
} from './shoptet-logic';

/** The product's Shoptet settings, defaults when never saved. */
export async function getShoptetSettings(cenikId: string): Promise<ShoptetSettings> {
  const row = await getDb().shoptetProductSettings.findUnique({ where: { cenikId } });
  if (!row) return DEFAULT_SHOPTET_SETTINGS;
  return {
    overrides: parseShoptetOverrides(row.overrides),
    stockAutoSync: row.stockAutoSync,
    safetyBuffer: row.safetyBuffer.toString(),
  };
}

export async function saveShoptetSettings(
  cenikId: string,
  input: ShoptetSettingsInput,
  userId: string,
): Promise<void> {
  const data = {
    overrides: input.overrides,
    stockAutoSync: input.stockAutoSync,
    safetyBuffer: input.safetyBuffer,
    updatedBy: userId,
  };
  await getDb().shoptetProductSettings.upsert({
    where: { cenikId },
    create: { cenikId, ...data },
    update: data,
  });
}

/** Product groups for the category select (code + name), by name. */
export async function listProductGroups(): Promise<{ kod: string; nazev: string | null }[]> {
  return getDb().flexiSkupinaZbozi.findMany({ select: { kod: true, nazev: true }, orderBy: [{ nazev: 'asc' }, { kod: 'asc' }] });
}
