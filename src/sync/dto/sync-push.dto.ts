import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { ProductSyncItemDto } from './product-sync-item.dto';

// One key per syncable table, each an array of changed rows since the
// device's local cursor. Only `products` exists for now (A4/A5 walking
// skeleton) — remaining tables are added the same way in A6.
export class SyncPushDto {
  @ApiProperty({ type: [ProductSyncItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductSyncItemDto)
  products?: ProductSyncItemDto[];
}
