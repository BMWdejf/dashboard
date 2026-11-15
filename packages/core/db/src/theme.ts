/** UI theme a user can pick in their profile. Pure; safe to import anywhere. */
export const THEMES = ['dark', 'light', 'system'] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = 'dark';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/** Any stored or submitted value → a valid theme (unknown values fall back to the default). */
export function parseTheme(value: unknown): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}
