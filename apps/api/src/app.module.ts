import { Module } from '@nestjs/common';

import { FlexiSyncModule } from './flexi-sync/flexi-sync.module';
import { IntegrationChecksModule } from './integration-checks/integration-checks.module';
import { LinksModule } from './links/links.module';
import { ProductsModule } from './products/products.module';
import { SupplierFeedsModule } from './supplier-feeds/supplier-feeds.module';

import { AppService } from './app.service';
import { AppController } from './app.controller';

@Module({
  imports: [LinksModule, FlexiSyncModule, ProductsModule, IntegrationChecksModule, SupplierFeedsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
