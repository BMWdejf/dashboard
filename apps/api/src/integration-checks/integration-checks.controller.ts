import { BadRequestException, Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';

import { feedCheckInput, flexiCheckInput, shoptetCheckInput } from '@repo/core-sync';

import { SyncTokenGuard } from '../flexi-sync/sync-token.guard';
import { IntegrationChecksService } from './integration-checks.service';

interface Schema<T> {
  safeParse(
    body: unknown,
  ): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

function parse<T>(schema: Schema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Invalid connection details.',
      // Field names and messages only, never the submitted values.
      errors: parsed.error.issues.map((i) => `${i.path.map(String).join('.') || '(body)'}: ${i.message}`),
    });
  }
  return parsed.data;
}

/**
 * Pre-flight checks for a new integration; nothing is saved.
 * - POST /integrations/checks/flexi    { host, port, user, password }
 * - POST /integrations/checks/shoptet  { token }
 * - POST /integrations/checks/feed     { url }
 * All need `Authorization: Bearer <SYNC_API_TOKEN>`.
 */
@Controller('integrations/checks')
@UseGuards(SyncTokenGuard)
export class IntegrationChecksController {
  constructor(private readonly checks: IntegrationChecksService) {}

  @Post('flexi')
  @HttpCode(200)
  flexi(@Body() body: unknown) {
    return this.checks.flexi(parse(flexiCheckInput, body));
  }

  @Post('shoptet')
  @HttpCode(200)
  shoptet(@Body() body: unknown) {
    return this.checks.shoptet(parse(shoptetCheckInput, body));
  }

  @Post('feed')
  @HttpCode(200)
  feed(@Body() body: unknown) {
    return this.checks.feed(parse(feedCheckInput, body));
  }
}
