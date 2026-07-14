import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncResource } from '../sync-resource.interface';
import { insertOnceImmutable } from '../upsert-helpers';
import { CashCutSyncItemDto } from '../dto/cash-cut-sync-item.dto';

@Injectable()
export class CashCutsResource implements SyncResource<CashCutSyncItemDto> {
  readonly tableName = 'cashCuts';

  constructor(private readonly prisma: PrismaService) {}

  findManyByIds(ids: string[]) {
    return this.prisma.cashCut.findMany({ where: { id: { in: ids } } });
  }

  toPullDto(
    row: Awaited<ReturnType<CashCutsResource['findManyByIds']>>[number],
  ) {
    return {
      uuid: row.id,
      sessionUuid: row.sessionId,
      userUuid: row.userId,
      cutType: row.cutType,
      openingAmount: Number(row.openingAmount),
      totalCashSales: Number(row.totalCashSales),
      totalCardSales: Number(row.totalCardSales),
      totalOtherSales: Number(row.totalOtherSales),
      totalSales: Number(row.totalSales),
      totalCancelledAmount: Number(row.totalCancelledAmount),
      cancelledCount: row.cancelledCount,
      expectedCash: Number(row.expectedCash),
      actualCash: row.actualCash !== null ? Number(row.actualCash) : null,
      cashDifference:
        row.cashDifference !== null ? Number(row.cashDifference) : null,
      transactionCount: row.transactionCount,
      totalOutflows: Number(row.totalOutflows),
      outflowCount: row.outflowCount,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async upsertFromSync(
    businessId: string,
    _deviceId: string,
    dto: CashCutSyncItemDto,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const fields = {
        sessionId: dto.sessionUuid,
        userId: dto.userUuid,
        cutType: dto.cutType,
        openingAmount: dto.openingAmount,
        totalCashSales: dto.totalCashSales,
        totalCardSales: dto.totalCardSales,
        totalOtherSales: dto.totalOtherSales,
        totalSales: dto.totalSales,
        totalCancelledAmount: dto.totalCancelledAmount,
        cancelledCount: dto.cancelledCount,
        expectedCash: dto.expectedCash,
        actualCash: dto.actualCash ?? null,
        cashDifference: dto.cashDifference ?? null,
        transactionCount: dto.transactionCount,
        totalOutflows: dto.totalOutflows,
        outflowCount: dto.outflowCount,
        notes: dto.notes ?? null,
        createdAt: new Date(dto.createdAt),
      };
      await insertOnceImmutable(
        tx,
        tx.cashCut,
        businessId,
        'cashCuts',
        dto.uuid,
        fields,
      );
    });
  }
}
