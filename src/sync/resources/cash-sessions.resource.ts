import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncResource } from '../sync-resource.interface';
import { upsertMutable } from '../upsert-helpers';
import { CashSessionSyncItemDto } from '../dto/cash-session-sync-item.dto';

@Injectable()
export class CashSessionsResource implements SyncResource<CashSessionSyncItemDto> {
  readonly tableName = 'cashSessions';

  constructor(private readonly prisma: PrismaService) {}

  findManyByIds(ids: string[]) {
    return this.prisma.cashSession.findMany({ where: { id: { in: ids } } });
  }

  toPullDto(
    row: Awaited<ReturnType<CashSessionsResource['findManyByIds']>>[number],
  ) {
    return {
      uuid: row.id,
      userUuid: row.userId,
      openingAmount: Number(row.openingAmount),
      status: row.status,
      registerId: row.registerId,
      openedAt: row.openedAt.toISOString(),
      closedAt: row.closedAt ? row.closedAt.toISOString() : null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // userId es requerido: se pasa directo confiando en que `users` ya se
  // sincronizó antes en el mismo ciclo (ver orden de SYNC_TABLES en el
  // worker de Electron) — si no existiera aún, la restricción FK de
  // Postgres rechaza esta fila puntual (capturado por el try/catch de
  // SyncService.push) y se reintenta en el próximo ciclo.
  async upsertFromSync(
    businessId: string,
    _deviceId: string,
    dto: CashSessionSyncItemDto,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const fields = {
        businessId,
        userId: dto.userUuid,
        openingAmount: dto.openingAmount,
        status: dto.status,
        registerId: dto.registerId,
        openedAt: new Date(dto.openedAt),
        closedAt: dto.closedAt ? new Date(dto.closedAt) : null,
        updatedAt: new Date(dto.updatedAt),
      };
      await upsertMutable(
        tx,
        tx.cashSession,
        businessId,
        'cashSessions',
        dto.uuid,
        fields,
        new Date(dto.updatedAt),
      );
    });
  }
}
