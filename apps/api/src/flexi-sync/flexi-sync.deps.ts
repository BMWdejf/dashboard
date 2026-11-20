import { FlexiClient } from '@repo/client-flexi';
import { flexiEnv, loadEnv } from '@repo/core-config';
import { createFlexiMirrorStore } from '@repo/core-db';
import type { MirrorFlexiReader, MirrorStore } from '@repo/core-sync';

/** What a sync run needs; created lazily so the API starts without Flexi env. */
export interface FlexiSyncDeps {
  flexi: MirrorFlexiReader;
  store: MirrorStore;
}

/**
 * Builds the Flexi client (read-only use, dry-run stays on) and the mirror store
 * from env. Throws EnvError listing what is missing.
 */
export function createFlexiSyncDeps(): FlexiSyncDeps {
  const env = loadEnv(flexiEnv);
  return {
    flexi: new FlexiClient({
      url: env.FLEXI_URL,
      company: env.FLEXI_COMPANY,
      user: env.FLEXI_USER,
      password: env.FLEXI_PASSWORD,
      // The sync only reads; keep writes impossible to send for real.
      dryRun: true,
    }),
    store: createFlexiMirrorStore(),
  };
}
