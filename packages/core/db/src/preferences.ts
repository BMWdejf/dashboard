import { getDb } from './client';
import {
  parseLocale,
  parsePriceMode,
  parseProductSettings,
  type Locale,
  type PriceMode,
  type ProductSettings,
} from './settings';
import { parseTheme, type Theme } from './theme';

export interface UserPreferences {
  theme: Theme;
  language: Locale;
  priceMode: PriceMode;
  productSettings: ProductSettings;
}

/** All of the user's settings; defaults for anything never saved. */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const row = await getDb().userPreference.findUnique({ where: { userId } });
  return {
    theme: parseTheme(row?.theme),
    language: parseLocale(row?.language),
    priceMode: parsePriceMode(row?.priceMode),
    productSettings: parseProductSettings(row?.productSettings),
  };
}

/** The user's saved theme, or the default when they never chose one. */
export async function getUserTheme(userId: string): Promise<Theme> {
  return (await getUserPreferences(userId)).theme;
}

type Writable = { theme: Theme } | { language: Locale } | { priceMode: PriceMode } | { productSettings: ProductSettings };

async function save(userId: string, data: Writable): Promise<void> {
  await getDb().userPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

export const setUserTheme = (userId: string, theme: Theme) => save(userId, { theme });
export const setUserLanguage = (userId: string, language: Locale) => save(userId, { language });
export const setUserPriceMode = (userId: string, priceMode: PriceMode) => save(userId, { priceMode });
export const setUserProductSettings = (userId: string, productSettings: ProductSettings) =>
  save(userId, { productSettings });
