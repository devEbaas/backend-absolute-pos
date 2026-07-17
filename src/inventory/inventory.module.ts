import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { InventoryController } from './inventory.controller';

@Module({
  imports: [SyncModule],
  controllers: [InventoryController],
})
export class InventoryModule {}
