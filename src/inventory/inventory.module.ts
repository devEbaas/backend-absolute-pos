import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryEntriesController } from './inventory-entries.controller';
import { InventoryEntriesService } from './inventory-entries.service';

@Module({
  controllers: [InventoryController, InventoryEntriesController],
  providers: [InventoryEntriesService],
})
export class InventoryModule {}
