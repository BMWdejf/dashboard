import { createServer, type Server } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { networkFailure } from '@repo/core-sync';

import { pinnedFetch } from './integration-checks.module';

/**
 * The connect-time guard, end to end through undici: a host name that resolves
 * to loopback (as a rebound DNS answer would) is refused before any byte is
 * sent, even though a server is listening there.
 */
describe('pinnedFetch', () => {
  let server: Server;
  let port = 0;
  let hits = 0;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      hits++;
      res.end('<SHOP/>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('refuses a host that resolves to loopback, in both modes', async () => {
    for (const allowPrivate of [false, true]) {
      const error = await pinnedFetch(allowPrivate)(`http://localhost:${port}/feed.xml`).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).not.toBeNull();
      expect(networkFailure(error).code).toBe('blocked');
    }
    expect(hits).toBe(0);
  });
});
