import type { CashCut, CashOutflow, CashSession } from '@prisma/client';

// Formas de respuesta de la caja para la app móvil (specs/22 §3.4): números JSON (Prisma devuelve los Decimal como
// cadenas), fechas ISO en UTC y nombres de usuario resueltos.

type WithUser<T> = T & { user?: { name: string } | null };

export function toCashSessionDto(row: WithUser<CashSession>) {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user?.name ?? null,
    openingAmount: Number(row.openingAmount),
    status: row.status,
    registerId: row.registerId,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  };
}

export function toCashOutflowDto(row: WithUser<CashOutflow>) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    userId: row.userId,
    userName: row.user?.name ?? null,
    amount: Number(row.amount),
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toCashCutDto(
  row: WithUser<CashCut> & { session?: CashSession | null },
) {
  const num = (v: unknown) => Number(v);
  return {
    id: row.id,
    sessionId: row.sessionId,
    userId: row.userId,
    userName: row.user?.name ?? null,
    registerId: row.session?.registerId ?? null,
    cutType: row.cutType,
    openingAmount: num(row.openingAmount),
    totalCashSales: num(row.totalCashSales),
    totalCardSales: num(row.totalCardSales),
    totalTransferSales: num(row.totalTransferSales),
    totalOtherSales: num(row.totalOtherSales),
    totalSales: num(row.totalSales),
    totalCancelledAmount: num(row.totalCancelledAmount),
    cancelledCount: row.cancelledCount,
    totalOutflows: num(row.totalOutflows),
    outflowCount: row.outflowCount,
    expectedCash: num(row.expectedCash),
    actualCash: row.actualCash === null ? null : num(row.actualCash),
    cashDifference:
      row.cashDifference === null ? null : num(row.cashDifference),
    transactionCount: row.transactionCount,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    sessionOpenedAt: row.session?.openedAt.toISOString() ?? null,
    sessionClosedAt: row.session?.closedAt
      ? row.session.closedAt.toISOString()
      : null,
  };
}
