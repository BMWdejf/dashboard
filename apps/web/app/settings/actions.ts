'use server';

import {
  isLocale,
  isPriceMode,
  isTheme,
  productSettingsInput,
  setUserLanguage,
  setUserPriceMode,
  setUserProductSettings,
  setUserTheme,
} from '@repo/core-db';

import { getAuth } from '../../lib/auth/server';
import { getI18n, writeLocaleCookie } from '../../lib/locale';
import { writeThemeCookie } from '../../lib/theme';

export type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * Validates, checks the session, saves to Neon, then runs `after` (cookies).
 * Errors are logged on the server and shown to the user as one short message.
 */
async function save(
  valid: boolean,
  write: (userId: string) => Promise<void>,
  after?: () => Promise<void>,
): Promise<SaveResult> {
  const { t } = await getI18n();
  if (!valid) return { ok: false, error: t.common.invalidValue };
  const { data: session } = await getAuth().getSession();
  if (!session?.user) return { ok: false, error: t.common.notSignedIn };
  try {
    await write(session.user.id);
  } catch (e) {
    console.error('settings: save failed', e instanceof Error ? e.message : e);
    return { ok: false, error: t.common.saveFailed };
  }
  await after?.();
  return { ok: true };
}

export async function saveTheme(theme: string): Promise<SaveResult> {
  if (!isTheme(theme)) return save(false, async () => {});
  return save(true, (id) => setUserTheme(id, theme), () => writeThemeCookie(theme));
}

export async function saveLanguage(language: string): Promise<SaveResult> {
  if (!isLocale(language)) return save(false, async () => {});
  return save(true, (id) => setUserLanguage(id, language), () => writeLocaleCookie(language));
}

export async function savePriceMode(mode: string): Promise<SaveResult> {
  if (!isPriceMode(mode)) return save(false, async () => {});
  return save(true, (id) => setUserPriceMode(id, mode));
}

export async function saveProductSettings(input: unknown): Promise<SaveResult> {
  const parsed = productSettingsInput.safeParse(input);
  if (!parsed.success) return save(false, async () => {});
  return save(true, (id) => setUserProductSettings(id, parsed.data));
}
