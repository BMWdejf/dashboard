import { Module } from '@nestjs/common';

import { FlexiSyncModule } from './flexi-sync/flexi-sync.module';
import { LinksModule } from './links/links.module';
import { ProductsModule } from './products/products.module';

import { AppService } from './app.service';
import { AppController } from './app.controller';

@Module({
  imports: [LinksModule, FlexiSyncModule, ProductsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
