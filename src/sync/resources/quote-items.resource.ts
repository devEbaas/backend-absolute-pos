import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncResource } from '../sync-resource.interface';
import { insertOnceImmutable } from '../upsert-helpers';
import { QuoteItemSyncItemDto } from '../dto/quote-item-sync-item.dto';

@Injectable()
export class QuoteItemsResource implements SyncResource<QuoteItemSyncItemDto> {
  readonly tableName = 'quoteItems';

  constructor(private readonly prisma: PrismaService) {}

  findManyByIds(ids: string[]) {
    return this.prisma.quoteItem.findMany({ where: { id: { in: ids } } });
  }

  toPullDto(
    row: Awaited<ReturnType<QuoteItemsResource['findManyByIds']>>[number],
  ) {
    return {
      uuid: row.id,
      quoteUuid: row.quoteId,
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
    dto: QuoteItemSyncItemDto,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const fields = {
        quoteId: dto.quoteUuid,
        productId: dto.productUuid,
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        subtotal: dto.subtotal,
        linkedProductName: dto.linkedProductName ?? null,
      };
      await insertOnceImmutable(
        tx,
        tx.quoteItem,
        businessId,
        'quoteItems',
        dto.uuid,
        fields,
      );
    });
  }
}
