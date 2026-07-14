import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

// Join row — immutable once created (the local app deletes+reinserts the
// whole set when a promotion's product list changes, rather than
// updating rows). Known limitation: a product removed from a promotion
// locally does not currently propagate as a deletion to the cloud copy —
// acceptable for now since this table only feeds future reporting, not
// POS transaction logic. Revisit if the dashboard needs it accurate.
export class PromotionProductSyncItemDto {
  @ApiProperty() @IsUUID() uuid: string;
  @ApiProperty() @IsUUID() promotionUuid: string;
  @ApiProperty() @IsUUID() productUuid: string;
}
