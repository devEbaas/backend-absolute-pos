import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncResource } from '../sync-resource.interface';
import { insertOnceImmutable } from '../upsert-helpers';
import { PromotionProductSyncItemDto } from '../dto/promotion-product-sync-item.dto';

@Injectable()
export class PromotionProductsResource implements SyncResource<PromotionProductSyncItemDto> {
  readonly tableName = 'promotionProducts';

  constructor(private readonly prisma: PrismaService) {}

  findManyByIds(ids: string[]) {
    return this.prisma.promotionProduct.findMany({
      where: { id: { in: ids } },
    });
  }

  toPullDto(
    row: Awaited<
      ReturnType<PromotionProductsResource['findManyByIds']>
    >[number],
  ) {
    return {
      uuid: row.id,
      promotionUuid: row.promotionId,
      productUuid: row.productId,
    };
  }

  async upsertFromSync(
    businessId: string,
    _deviceId: string,
    dto: PromotionProductSyncItemDto,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const fields = {
        promotionId: dto.promotionUuid,
        productId: dto.productUuid,
      };
      await insertOnceImmutable(
        tx,
        tx.promotionProduct,
        businessId,
        'promotionProducts',
        dto.uuid,
        fields,
      );
    });
  }
}
