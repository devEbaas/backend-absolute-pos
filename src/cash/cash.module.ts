import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { CashController } from './cash.controller';
import { CashService } from './cash.service';

@Module({
  imports: [SyncModule],
  controllers: [CashController],
  providers: [CashService],
})
export class CashModule {}
