import { getDb } from './client';
import { parseTheme, type Theme } from './theme';

/** The user's saved theme, or the default when they never chose one. */
export async function getUserTheme(userId: string): Promise<Theme> {
  const row = await getDb().userPreference.findUnique({ where: { userId } });
  return parseTheme(row?.theme);
}

export async function setUserTheme(userId: string, theme: Theme): Promise<void> {
  await getDb().userPreference.upsert({
    where: { userId },
    create: { userId, theme },
    update: { theme },
  });
}
