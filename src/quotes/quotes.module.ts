import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [RealtimeModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
