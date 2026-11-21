import { BadRequestException, Body, Controller, HttpCode, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';

import { productChangesSchema } from '@repo/core-sync';

import { SyncTokenGuard } from '../flexi-sync/sync-token.guard';
import { ProductsService } from './products.service';

/**
 * Product edits (dashboard product detail). `:flexiId` is the Flexi internal id.
 * - PATCH /products/:flexiId        change fields in Flexi (dry-run unless FLEXI_DRY_RUN=false)
 * - POST  /products/:flexiId/sync   read the product from Flexi into the mirror now
 * Both need `Authorization: Bearer <SYNC_API_TOKEN>`.
 */
@Controller('products')
@UseGuards(SyncTokenGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Patch(':flexiId')
  save(@Param('flexiId', ParseIntPipe) flexiId: number, @Body() body: unknown) {
    const parsed = productChangesSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid product changes.',
        errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`),
      });
    }
    return this.products.save(flexiId, parsed.data);
  }

  @Post(':flexiId/sync')
  @HttpCode(200)
  sync(@Param('flexiId', ParseIntPipe) flexiId: number) {
    return this.products.sync(flexiId);
  }
}
