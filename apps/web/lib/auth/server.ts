import { createNeonAuth } from '@neon/auth/next/server';
import { authEnv, loadEnv } from '@repo/core-config';

type NeonAuth = ReturnType<typeof createNeonAuth>;

let instance: NeonAuth | undefined;

/**
 * The Neon Auth server instance, created on first use so `next build` works
 * without auth env. Env comes from apps/web/.env.local (`neon env pull`).
 */
export function getAuth(): NeonAuth {
  if (!instance) {
    const env = loadEnv(authEnv);
    instance = createNeonAuth({
      baseUrl: env.NEON_AUTH_BASE_URL,
      cookies: { secret: env.NEON_AUTH_COOKIE_SECRET },
    });
  }
  return instance;
}
