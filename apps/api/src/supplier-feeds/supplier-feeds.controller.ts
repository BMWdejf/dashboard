import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';

import { feedPreviewInput, supplierFeedInput } from '@repo/core-sync';

import { SyncTokenGuard } from '../flexi-sync/sync-token.guard';
import { SupplierFeedsService } from './supplier-feeds.service';

interface Schema<T> {
  safeParse(
    body: unknown,
  ): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

function parse<T>(schema: Schema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Invalid feed details.',
      errors: parsed.error.issues.map((i) => `${i.path.map(String).join('.') || '(body)'}: ${i.message}`),
    });
  }
  return parsed.data;
}

/** Neon Auth user id of whoever saves the feed, passed by the web app. */
function createdBy(body: unknown): string | null {
  const v = (body as { createdBy?: unknown } | null)?.createdBy;
  return typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : null;
}

/**
 * Supplier XML feeds.
 * - POST /supplier-feeds/preview   { url, itemElement } → tags, samples, suggested mapping
 * - POST /supplier-feeds           { name, url, dialect, itemElement, mapping, importIntervalMinutes, createdBy? }
 *                                  saves the feed and queues its first import (201 + id; 409 if the URL exists)
 * - POST /supplier-feeds/:id/import  queues an import (202)
 * - GET  /supplier-feeds/cron      queues the due imports, for an external scheduler (202)
 * All need `Authorization: Bearer <SYNC_API_TOKEN>`.
 */
@Controller('supplier-feeds')
@UseGuards(SyncTokenGuard)
export class SupplierFeedsController {
  constructor(private readonly feeds: SupplierFeedsService) {}

  @Post('preview')
  @HttpCode(200)
  preview(@Body() body: unknown) {
    return this.feeds.preview(parse(feedPreviewInput, body));
  }

  @Post()
  create(@Body() body: unknown) {
    // The schema strips unknown keys, createdBy included.
    return this.feeds.create(parse(supplierFeedInput, body), createdBy(body));
  }

  @Post(':id/import')
  @HttpCode(202)
  start(@Param('id', ParseUUIDPipe) id: string) {
    return this.feeds.start(id);
  }

  @Get('cron')
  @HttpCode(202)
  cron() {
    return this.feeds.runDue();
  }
}
