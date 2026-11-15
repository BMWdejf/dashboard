import { parseTheme, type Theme } from '@repo/core-db/theme';
import { cookies } from 'next/headers';

/**
 * The `theme` cookie mirrors the user's saved preference (user_preferences in
 * Neon) so every page renders in the right theme on the server, without a
 * flash. The database is the source of truth; the cookie is refreshed on
 * sign-in and whenever the user changes the theme.
 */
export const THEME_COOKIE = 'theme';

export async function readThemeCookie(): Promise<Theme> {
  return parseTheme((await cookies()).get(THEME_COOKIE)?.value);
}

export async function writeThemeCookie(theme: Theme): Promise<void> {
  (await cookies()).set(THEME_COOKIE, theme, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
}
