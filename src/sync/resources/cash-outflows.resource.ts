import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncResource } from '../sync-resource.interface';
import { insertOnceImmutable } from '../upsert-helpers';
import { CashOutflowSyncItemDto } from '../dto/cash-outflow-sync-item.dto';

@Injectable()
export class CashOutflowsResource implements SyncResource<CashOutflowSyncItemDto> {
  readonly tableName = 'cashOutflows';

  constructor(private readonly prisma: PrismaService) {}

  findManyByIds(ids: string[]) {
    return this.prisma.cashOutflow.findMany({ where: { id: { in: ids } } });
  }

  toPullDto(
    row: Awaited<ReturnType<CashOutflowsResource['findManyByIds']>>[number],
  ) {
    return {
      uuid: row.id,
      sessionUuid: row.sessionId,
      userUuid: row.userId,
      amount: Number(row.amount),
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async upsertFromSync(
    businessId: string,
    _deviceId: string,
    dto: CashOutflowSyncItemDto,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const fields = {
        sessionId: dto.sessionUuid,
        userId: dto.userUuid,
        amount: dto.amount,
        reason: dto.reason,
        createdAt: new Date(dto.createdAt),
      };
      await insertOnceImmutable(
        tx,
        tx.cashOutflow,
        businessId,
        'cashOutflows',
        dto.uuid,
        fields,
      );
    });
  }
}
