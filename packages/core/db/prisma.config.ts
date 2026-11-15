import path from 'node:path';

import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Migrations and `db execute` use the direct (unpooled) connection to the
// `dashboard` database, from the repo root .env.local (see AGENTS.md).
// `prisma generate` needs no database, so a missing URL is fine there.
config({ path: path.resolve(process.cwd(), '../../../.env.local'), quiet: true });

const url = process.env.DATABASE_URL_UNPOOLED;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(url ? { datasource: { url } } : {}),
});
