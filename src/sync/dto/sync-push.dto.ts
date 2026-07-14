import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { ProductSyncItemDto } from './product-sync-item.dto';
import { UserSyncItemDto } from './user-sync-item.dto';
import { CashSessionSyncItemDto } from './cash-session-sync-item.dto';
import { PromotionSyncItemDto } from './promotion-sync-item.dto';
import { PromotionProductSyncItemDto } from './promotion-product-sync-item.dto';
import { SaleSyncItemDto } from './sale-sync-item.dto';
import { SaleItemSyncItemDto } from './sale-item-sync-item.dto';
import { SaleCancellationSyncItemDto } from './sale-cancellation-sync-item.dto';
import { InventoryMovementSyncItemDto } from './inventory-movement-sync-item.dto';
import { CashCutSyncItemDto } from './cash-cut-sync-item.dto';
import { CashOutflowSyncItemDto } from './cash-outflow-sync-item.dto';

// One key per syncable table, each an array of changed rows since the
// device's local cursor. Order here has no bearing on processing order —
// SyncService.push iterates a fixed TABLE_ORDER, not Object.keys().
export class SyncPushDto {
  @ApiProperty({ type: [UserSyncItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserSyncItemDto)
  users?: UserSyncItemDto[];

  @ApiProperty({ type: [CashSessionSyncItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CashSessionSyncItemDto)
  cashSessions?: CashSessionSyncItemDto[];

  @ApiProperty({ type: [ProductSyncItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductSyncItemDto)
  products?: ProductSyncItemDto[];

  @ApiProperty({ type: [PromotionSyncItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromotionSyncItemDto)
  promotions?: PromotionSyncItemDto[];

  @ApiProperty({ type: [PromotionProductSyncItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromotionProductSyncItemDto)
  promotionProducts?: PromotionProductSyncItemDto[];

  @ApiProperty({ type: [SaleSyncItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleSyncItemDto)
  sales?: SaleSyncItemDto[];

  @ApiProperty({ type: [SaleItemSyncItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemSyncItemDto)
  saleItems?: SaleItemSyncItemDto[];

  @ApiProperty({ type: [SaleCancellationSyncItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleCancellationSyncItemDto)
  saleCancellations?: SaleCancellationSyncItemDto[];

  @ApiProperty({ type: [InventoryMovementSyncItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryMovementSyncItemDto)
  inventoryMovements?: InventoryMovementSyncItemDto[];

  @ApiProperty({ type: [CashCutSyncItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CashCutSyncItemDto)
  cashCuts?: CashCutSyncItemDto[];

  @ApiProperty({ type: [CashOutflowSyncItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CashOutflowSyncItemDto)
  cashOutflows?: CashOutflowSyncItemDto[];
}
