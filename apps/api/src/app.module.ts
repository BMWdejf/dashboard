import { Module } from '@nestjs/common';

import { FlexiSyncModule } from './flexi-sync/flexi-sync.module';
import { LinksModule } from './links/links.module';

import { AppService } from './app.service';
import { AppController } from './app.controller';

@Module({
  imports: [LinksModule, FlexiSyncModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
