import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ShowsController } from './shows.controller';
import { ShowsService } from './shows.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [ShowsController],
  providers: [ShowsService],
})
export class ShowsModule {}
