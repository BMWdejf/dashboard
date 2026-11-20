import { DEFAULT_LOCALE, type Locale } from '@repo/core-db/settings';

import { cs, type Dictionary } from './cs';
import { en } from './en';

export type { Dictionary };

const DICTIONARIES: Record<Locale, Dictionary> = { cs, en };

/** Intl locale for number and date formats. */
const INTL: Record<Locale, string> = { cs: 'cs-CZ', en: 'en-GB' };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

export function intlLocale(locale: Locale): string {
  return INTL[locale];
}

/** `fill('Hi {name}', { name: 'Eva' })` → `Hi Eva`. Unknown placeholders stay as they are. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) =>
    key in values ? String(values[key]) : m,
  );
}
