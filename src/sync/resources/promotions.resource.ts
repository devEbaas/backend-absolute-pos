import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncResource } from '../sync-resource.interface';
import { upsertMutable } from '../upsert-helpers';
import { PromotionSyncItemDto } from '../dto/promotion-sync-item.dto';

@Injectable()
export class PromotionsResource implements SyncResource<PromotionSyncItemDto> {
  readonly tableName = 'promotions';

  constructor(private readonly prisma: PrismaService) {}

  findManyByIds(ids: string[]) {
    return this.prisma.promotion.findMany({ where: { id: { in: ids } } });
  }

  toPullDto(
    row: Awaited<ReturnType<PromotionsResource['findManyByIds']>>[number],
  ) {
    return {
      uuid: row.id,
      name: row.name,
      type: row.type,
      requiredQuantity: row.requiredQuantity,
      discountType: row.discountType,
      discountValue: Number(row.discountValue),
      freeQuantity: row.freeQuantity,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async upsertFromSync(
    businessId: string,
    _deviceId: string,
    dto: PromotionSyncItemDto,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const fields = {
        businessId,
        name: dto.name,
        type: dto.type,
        requiredQuantity: dto.requiredQuantity,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        freeQuantity: dto.freeQuantity,
        active: dto.active,
        createdAt: new Date(dto.createdAt),
        updatedAt: new Date(dto.updatedAt),
      };
      await upsertMutable(
        tx,
        tx.promotion,
        businessId,
        'promotions',
        dto.uuid,
        fields,
        new Date(dto.updatedAt),
      );
    });
  }
}
