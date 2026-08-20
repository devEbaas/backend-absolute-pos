import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncResource } from '../sync-resource.interface';
import { upsertMutable } from '../upsert-helpers';
import { QuoteSyncItemDto } from '../dto/quote-sync-item.dto';

@Injectable()
export class QuotesResource implements SyncResource<QuoteSyncItemDto> {
  readonly tableName = 'quotes';

  constructor(private readonly prisma: PrismaService) {}

  findManyByIds(ids: string[]) {
    return this.prisma.quote.findMany({ where: { id: { in: ids } } });
  }

  toPullDto(row: Awaited<ReturnType<QuotesResource['findManyByIds']>>[number]) {
    return {
      uuid: row.id,
      userUuid: row.userId,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      subtotal: Number(row.subtotal),
      discountAmount: Number(row.discountAmount),
      total: Number(row.total),
      status: row.status,
      validUntil: row.validUntil,
      notes: row.notes,
      convertedSaleUuid: row.convertedSaleId,
      convertedAt: row.convertedAt ? row.convertedAt.toISOString() : null,
      cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
      cancelledByUuid: row.cancelledBy,
      cancellationReason: row.cancellationReason,
      hidden: row.hidden,
      registerId: row.registerId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async upsertFromSync(
    businessId: string,
    deviceId: string,
    dto: QuoteSyncItemDto,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // convertedSaleId no es una relación FK real (ver comentario en el
      // modelo Prisma Quote) — si la venta todavía no llegó a la nube en
      // este mismo ciclo, se guarda tal cual llega (puede quedar apuntando
      // a un uuid que exista un instante después, dentro del mismo push).
      const cancelledByUser = dto.cancelledByUuid
        ? await tx.user.findUnique({ where: { id: dto.cancelledByUuid } })
        : null;

      const fields = {
        businessId,
        deviceId,
        userId: dto.userUuid,
        customerName: dto.customerName ?? null,
        customerPhone: dto.customerPhone ?? null,
        subtotal: dto.subtotal,
        discountAmount: dto.discountAmount,
        total: dto.total,
        status: dto.status,
        validUntil: dto.validUntil ?? null,
        notes: dto.notes ?? null,
        convertedSaleId: dto.convertedSaleUuid ?? null,
        convertedAt: dto.convertedAt ? new Date(dto.convertedAt) : null,
        cancelledAt: dto.cancelledAt ? new Date(dto.cancelledAt) : null,
        cancelledBy: cancelledByUser?.id ?? null,
        cancellationReason: dto.cancellationReason ?? null,
        hidden: dto.hidden,
        registerId: dto.registerId,
        createdAt: new Date(dto.createdAt),
        updatedAt: new Date(dto.updatedAt),
      };

      await upsertMutable(
        tx,
        tx.quote,
        businessId,
        'quotes',
        dto.uuid,
        fields,
        new Date(dto.updatedAt),
      );
    });
  }
}
