import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ShowRefreshService } from './show-refresh.service';
import { ShowsController } from './shows.controller';
import { ShowsService } from './shows.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [ShowsController],
  providers: [ShowsService, ShowRefreshService],
  exports: [ShowsService, ShowRefreshService],
})
export class ShowsModule {}
