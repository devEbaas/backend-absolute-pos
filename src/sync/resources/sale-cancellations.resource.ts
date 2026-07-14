import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncResource } from '../sync-resource.interface';
import { insertOnceImmutable } from '../upsert-helpers';
import { SaleCancellationSyncItemDto } from '../dto/sale-cancellation-sync-item.dto';

@Injectable()
export class SaleCancellationsResource implements SyncResource<SaleCancellationSyncItemDto> {
  readonly tableName = 'saleCancellations';

  constructor(private readonly prisma: PrismaService) {}

  findManyByIds(ids: string[]) {
    return this.prisma.saleCancellation.findMany({
      where: { id: { in: ids } },
    });
  }

  toPullDto(
    row: Awaited<
      ReturnType<SaleCancellationsResource['findManyByIds']>
    >[number],
  ) {
    return {
      uuid: row.id,
      saleUuid: row.saleId,
      cancelledByUuid: row.cancelledBy,
      reason: row.reason,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async upsertFromSync(
    businessId: string,
    _deviceId: string,
    dto: SaleCancellationSyncItemDto,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const fields = {
        saleId: dto.saleUuid,
        cancelledBy: dto.cancelledByUuid,
        reason: dto.reason ?? null,
        notes: dto.notes ?? null,
        createdAt: new Date(dto.createdAt),
      };
      await insertOnceImmutable(
        tx,
        tx.saleCancellation,
        businessId,
        'saleCancellations',
        dto.uuid,
        fields,
      );
    });
  }
}
