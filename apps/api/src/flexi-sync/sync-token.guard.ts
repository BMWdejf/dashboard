import { timingSafeEqual } from 'node:crypto';

import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

import { loadEnv, syncEnv } from '@repo/core-config';

/** `Authorization: Bearer <SYNC_API_TOKEN>`. No token configured → 503. */
@Injectable()
export class SyncTokenGuard implements CanActivate {
  private readonly token = loadEnv(syncEnv).SYNC_API_TOKEN;

  canActivate(context: ExecutionContext): boolean {
    if (!this.token) throw new ServiceUnavailableException('Sync API is disabled (no SYNC_API_TOKEN).');
    const header = context.switchToHttp().getRequest<Request>().headers.authorization ?? '';
    const given = Buffer.from(header.replace(/^Bearer\s+/i, ''));
    const expected = Buffer.from(this.token);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
