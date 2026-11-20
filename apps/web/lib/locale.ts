import { parseLocale, type Locale } from '@repo/core-db/settings';
import { cookies } from 'next/headers';

import { getDictionary, type Dictionary } from './i18n';

/**
 * The `lang` cookie mirrors the user's saved language (user_preferences.language
 * in Neon), like the `theme` cookie: pages render in the right language without
 * a database call. Refreshed on sign-in and whenever the user changes it.
 */
export const LANG_COOKIE = 'lang';

export async function readLocaleCookie(): Promise<Locale> {
  return parseLocale((await cookies()).get(LANG_COOKIE)?.value);
}

export async function writeLocaleCookie(locale: Locale): Promise<void> {
  (await cookies()).set(LANG_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
}

/** Locale and dictionary for the current request. */
export async function getI18n(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await readLocaleCookie();
  return { locale, t: getDictionary(locale) };
}
