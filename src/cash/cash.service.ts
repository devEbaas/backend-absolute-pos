import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePaymentMethod } from '../common/payment-method.util';
import { CashSessionsResource } from '../sync/resources/cash-sessions.resource';
import { CashOutflowsResource } from '../sync/resources/cash-outflows.resource';
import { CashCutsResource } from '../sync/resources/cash-cuts.resource';
import { CashSessionSyncItemDto } from '../sync/dto/cash-session-sync-item.dto';
import { CashOutflowSyncItemDto } from '../sync/dto/cash-outflow-sync-item.dto';
import { CashCutSyncItemDto } from '../sync/dto/cash-cut-sync-item.dto';
import { OpenCashSessionDto } from './dto/open-cash-session.dto';
import { CreateCashOutflowDto } from './dto/create-cash-outflow.dto';
import { CreateCashCutDto } from './dto/create-cash-cut.dto';

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashSessions: CashSessionsResource,
    private readonly cashOutflows: CashOutflowsResource,
    private readonly cashCuts: CashCutsResource,
  ) {}

  async findSessionOrThrow(businessId: string, sessionId: string) {
    const session = await this.prisma.cashSession.findFirst({
      where: { businessId, id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('Sesión de caja no encontrada');
    }
    return session;
  }

  async openSession(
    businessId: string,
    deviceId: string,
    userId: string,
    dto: OpenCashSessionDto,
  ) {
    const now = new Date().toISOString();
    const syncDto: CashSessionSyncItemDto = {
      uuid: randomUUID(),
      userUuid: userId,
      openingAmount: dto.openingAmount,
      status: 'open',
      registerId: dto.registerId ?? 'PRINCIPAL',
      openedAt: now,
      closedAt: null,
      updatedAt: now,
    };
    await this.cashSessions.upsertFromSync(businessId, deviceId, syncDto);
    return syncDto;
  }

  async closeSession(businessId: string, deviceId: string, sessionId: string) {
    const session = await this.findSessionOrThrow(businessId, sessionId);
    if (session.status === 'closed') {
      throw new BadRequestException('La sesión ya está cerrada');
    }

    const syncDto: CashSessionSyncItemDto = {
      uuid: session.id,
      userUuid: session.userId,
      openingAmount: Number(session.openingAmount),
      status: 'closed',
      registerId: session.registerId,
      openedAt: session.openedAt.toISOString(),
      closedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.cashSessions.upsertFromSync(businessId, deviceId, syncDto);
    return syncDto;
  }

  async createOutflow(
    businessId: string,
    deviceId: string,
    userId: string,
    dto: CreateCashOutflowDto,
  ) {
    await this.findSessionOrThrow(businessId, dto.sessionId);

    const syncDto: CashOutflowSyncItemDto = {
      uuid: randomUUID(),
      sessionUuid: dto.sessionId,
      userUuid: userId,
      amount: dto.amount,
      reason: dto.reason,
      createdAt: new Date().toISOString(),
    };
    await this.cashOutflows.upsertFromSync(businessId, deviceId, syncDto);
    return syncDto;
  }

  // Mirrors absolute-electron-pos's calcSessionSummary (src/main/ipc/cash.ipc.js)
  // so cuts reconcile the same way on both sides: totals bucketed by
  // payment method, cancelled sales tracked separately (never counted in
  // totalSales), expectedCash = openingAmount + cash sales - outflows.
  // Computed server-side from Sale/CashOutflow rather than trusted from the
  // client — the mobile app only supplies the physically-counted actualCash.
  private async computeTotals(businessId: string, sessionId: string) {
    const session = await this.findSessionOrThrow(businessId, sessionId);

    const sales = await this.prisma.sale.findMany({
      where: { businessId, sessionId, cancelled: false },
      select: { paymentMethod: true, total: true },
    });

    let totalCashSales = 0;
    let totalCardSales = 0;
    let totalTransferSales = 0;
    let totalOtherSales = 0;
    for (const sale of sales) {
      const bucket = normalizePaymentMethod(sale.paymentMethod);
      const amount = Number(sale.total);
      if (bucket === 'cash') totalCashSales += amount;
      else if (bucket === 'card') totalCardSales += amount;
      else if (bucket === 'transfer') totalTransferSales += amount;
      else totalOtherSales += amount;
    }
    const totalSales =
      totalCashSales + totalCardSales + totalTransferSales + totalOtherSales;

    const cancelled = await this.prisma.sale.aggregate({
      where: { businessId, sessionId, cancelled: true },
      _count: true,
      _sum: { total: true },
    });

    const outflows = await this.prisma.cashOutflow.aggregate({
      where: { sessionId },
      _count: true,
      _sum: { amount: true },
    });

    const openingAmount = Number(session.openingAmount);
    const totalOutflows = Number(outflows._sum.amount ?? 0);

    return {
      session,
      openingAmount,
      totalCashSales,
      totalCardSales,
      totalTransferSales,
      totalOtherSales,
      totalSales,
      totalCancelledAmount: Number(cancelled._sum.total ?? 0),
      cancelledCount: cancelled._count,
      transactionCount: sales.length,
      totalOutflows,
      outflowCount: outflows._count,
      expectedCash: openingAmount + totalCashSales - totalOutflows,
    };
  }

  async createCut(
    businessId: string,
    deviceId: string,
    userId: string,
    dto: CreateCashCutDto,
  ) {
    const totals = await this.computeTotals(businessId, dto.sessionId);
    const actualCash = dto.actualCash ?? null;

    const syncDto: CashCutSyncItemDto = {
      uuid: randomUUID(),
      sessionUuid: dto.sessionId,
      userUuid: userId,
      cutType: dto.cutType ?? 'total',
      openingAmount: totals.openingAmount,
      totalCashSales: totals.totalCashSales,
      totalCardSales: totals.totalCardSales,
      totalTransferSales: totals.totalTransferSales,
      totalOtherSales: totals.totalOtherSales,
      totalSales: totals.totalSales,
      totalCancelledAmount: totals.totalCancelledAmount,
      cancelledCount: totals.cancelledCount,
      expectedCash: totals.expectedCash,
      actualCash,
      cashDifference:
        actualCash !== null ? actualCash - totals.expectedCash : null,
      transactionCount: totals.transactionCount,
      totalOutflows: totals.totalOutflows,
      outflowCount: totals.outflowCount,
      notes: dto.notes ?? null,
      createdAt: new Date().toISOString(),
    };
    await this.cashCuts.upsertFromSync(businessId, deviceId, syncDto);
    return syncDto;
  }
}
