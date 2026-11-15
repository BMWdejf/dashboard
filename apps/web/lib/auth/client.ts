'use client';

import { createAuthClient } from '@neon/auth/next';

let client: ReturnType<typeof createAuthClient> | undefined;

/**
 * Starts sign-in / sign-up with an OAuth provider configured in Neon Auth.
 * The browser is redirected; the promise only resolves with an error.
 */
export async function signInWithProvider(
  provider: 'google' | 'github',
  callbackURL: string,
): Promise<{ error: string | null }> {
  client ??= createAuthClient();
  try {
    const { error } = await client.signIn.social({ provider, callbackURL });
    return { error: error ? (error.message ?? 'unknown') : null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'unknown' };
  }
}
