import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [ProductsModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
