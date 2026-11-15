import { describe, expect, it } from '@jest/globals';

import { DEFAULT_THEME, isTheme, parseTheme } from './theme';

describe('theme', () => {
  it('accepts the three themes', () => {
    expect(['dark', 'light', 'system'].every(isTheme)).toBe(true);
  });

  it('falls back to the default for anything else', () => {
    expect(parseTheme('blue')).toBe(DEFAULT_THEME);
    expect(parseTheme(undefined)).toBe(DEFAULT_THEME);
    expect(parseTheme('light')).toBe('light');
  });
});
