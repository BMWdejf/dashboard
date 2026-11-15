'use server';

import { isTheme, setUserTheme } from '@repo/core-db';

import { getAuth } from '../../lib/auth/server';
import { writeThemeCookie } from '../../lib/theme';

export type SaveResult = { ok: true } | { ok: false; error: string };

/** Saves the theme picked in the profile: Neon first, then the cookie. */
export async function saveTheme(theme: string): Promise<SaveResult> {
  if (!isTheme(theme)) return { ok: false, error: 'Neznámý motiv.' };
  const { data: session } = await getAuth().getSession();
  if (!session?.user) return { ok: false, error: 'Nejste přihlášeni.' };
  try {
    await setUserTheme(session.user.id, theme);
  } catch (e) {
    console.error('saveTheme failed', e instanceof Error ? e.message : e);
    return { ok: false, error: 'Nastavení se nepodařilo uložit.' };
  }
  await writeThemeCookie(theme);
  return { ok: true };
}
