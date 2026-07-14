import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncResource } from '../sync-resource.interface';
import { upsertMutable } from '../upsert-helpers';
import { SaleSyncItemDto } from '../dto/sale-sync-item.dto';

@Injectable()
export class SalesResource implements SyncResource<SaleSyncItemDto> {
  readonly tableName = 'sales';

  constructor(private readonly prisma: PrismaService) {}

  findManyByIds(ids: string[]) {
    return this.prisma.sale.findMany({ where: { id: { in: ids } } });
  }

  toPullDto(row: Awaited<ReturnType<SalesResource['findManyByIds']>>[number]) {
    return {
      uuid: row.id,
      userUuid: row.userId,
      total: Number(row.total),
      paymentMethod: row.paymentMethod,
      registerId: row.registerId,
      sessionUuid: row.sessionId,
      cancelled: row.cancelled,
      cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
      cancelledByUuid: row.cancelledBy,
      cancellationReason: row.cancellationReason,
      discountAmount: Number(row.discountAmount),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async upsertFromSync(
    businessId: string,
    deviceId: string,
    dto: SaleSyncItemDto,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // sessionId/cancelledBy son opcionales de verdad en el negocio (una
      // venta sin sesión asociada, o no cancelada) — si el uuid referenciado
      // no existe todavía, se deja en null en vez de rechazar la fila
      // completa. userId es requerido y se pasa directo (ver
      // cash-sessions.resource.ts para el razonamiento del orden).
      const session = dto.sessionUuid
        ? await tx.cashSession.findUnique({ where: { id: dto.sessionUuid } })
        : null;
      const cancelledByUser = dto.cancelledByUuid
        ? await tx.user.findUnique({ where: { id: dto.cancelledByUuid } })
        : null;

      const fields = {
        businessId,
        deviceId,
        userId: dto.userUuid,
        total: dto.total,
        paymentMethod: dto.paymentMethod,
        registerId: dto.registerId,
        sessionId: session?.id ?? null,
        cancelled: dto.cancelled,
        cancelledAt: dto.cancelledAt ? new Date(dto.cancelledAt) : null,
        cancelledBy: cancelledByUser?.id ?? null,
        cancellationReason: dto.cancellationReason ?? null,
        discountAmount: dto.discountAmount,
        createdAt: new Date(dto.createdAt),
        updatedAt: new Date(dto.updatedAt),
      };

      await upsertMutable(
        tx,
        tx.sale,
        businessId,
        'sales',
        dto.uuid,
        fields,
        new Date(dto.updatedAt),
      );
    });
  }
}
