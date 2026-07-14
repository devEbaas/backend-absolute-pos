import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncResource } from '../sync-resource.interface';
import { insertOnceImmutable } from '../upsert-helpers';
import { SaleItemSyncItemDto } from '../dto/sale-item-sync-item.dto';

@Injectable()
export class SaleItemsResource implements SyncResource<SaleItemSyncItemDto> {
  readonly tableName = 'saleItems';

  constructor(private readonly prisma: PrismaService) {}

  findManyByIds(ids: string[]) {
    return this.prisma.saleItem.findMany({ where: { id: { in: ids } } });
  }

  toPullDto(
    row: Awaited<ReturnType<SaleItemsResource['findManyByIds']>>[number],
  ) {
    return {
      uuid: row.id,
      saleUuid: row.saleId,
      productUuid: row.productId,
      quantity: Number(row.quantity),
      unitPrice: Number(row.unitPrice),
      subtotal: Number(row.subtotal),
      linkedProductName: row.linkedProductName,
    };
  }

  async upsertFromSync(
    businessId: string,
    _deviceId: string,
    dto: SaleItemSyncItemDto,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const fields = {
        saleId: dto.saleUuid,
        productId: dto.productUuid,
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        subtotal: dto.subtotal,
        linkedProductName: dto.linkedProductName ?? null,
      };
      await insertOnceImmutable(
        tx,
        tx.saleItem,
        businessId,
        'saleItems',
        dto.uuid,
        fields,
      );
    });
  }
}
