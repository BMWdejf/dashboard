import { ServiceUnavailableException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { afterEach, describe, expect, it } from '@jest/globals';

import { SyncTokenGuard } from './sync-token.guard';

const TOKEN = 'x'.repeat(40);
const ctx = (authorization?: string) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }) }) as ExecutionContext;

describe('SyncTokenGuard', () => {
  const saved = process.env.SYNC_API_TOKEN;
  afterEach(() => {
    if (saved === undefined) delete process.env.SYNC_API_TOKEN;
    else process.env.SYNC_API_TOKEN = saved;
  });

  it('is disabled without a configured token', () => {
    delete process.env.SYNC_API_TOKEN;
    expect(() => new SyncTokenGuard().canActivate(ctx(`Bearer ${TOKEN}`))).toThrow(ServiceUnavailableException);
  });

  it('accepts the bearer token and rejects anything else', () => {
    process.env.SYNC_API_TOKEN = TOKEN;
    const guard = new SyncTokenGuard();
    expect(guard.canActivate(ctx(`Bearer ${TOKEN}`))).toBe(true);
    expect(() => guard.canActivate(ctx('Bearer wrong'))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx())).toThrow(UnauthorizedException);
  });
});
