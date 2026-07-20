import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { normalizePaymentMethod } from '../common/payment-method.util';

function dateRangeFilter(
  from?: string,
  to?: string,
): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(from) } : {}),
    ...(to ? { lte: new Date(to) } : {}),
  };
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  // Mirrors CashService.computeTotals's bucketing (cash.service.ts), just
  // over a business-wide date range instead of a single session.
  async overview(businessId: string, from?: string, to?: string) {
    const createdAt = dateRangeFilter(from, to);

    const sales = await this.prisma.sale.findMany({
      where: { businessId, cancelled: false, ...(createdAt && { createdAt }) },
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
      where: { businessId, cancelled: true, ...(createdAt && { createdAt }) },
      _count: true,
      _sum: { total: true },
    });

    const cuts = await this.prisma.cashCut.findMany({
      where: {
        session: { businessId },
        ...(createdAt && { createdAt }),
      },
      select: { cashDifference: true },
    });
    const cashDifference = cuts.reduce(
      (sum, cut) => sum + Number(cut.cashDifference ?? 0),
      0,
    );

    return {
      totalSales,
      totalCashSales,
      totalCardSales,
      totalTransferSales,
      totalOtherSales,
      transactionCount: sales.length,
      averageTicket: sales.length ? totalSales / sales.length : 0,
      cancelledCount: cancelled._count,
      cancelledAmount: Number(cancelled._sum.total ?? 0),
      cashDifference,
    };
  }

  async salesByDay(businessId: string, from?: string, to?: string) {
    const createdAt = dateRangeFilter(from, to);
    const sales = await this.prisma.sale.findMany({
      where: { businessId, cancelled: false, ...(createdAt && { createdAt }) },
      select: { createdAt: true, total: true },
      orderBy: { createdAt: 'asc' },
    });

    const byDay = new Map<string, { total: number; count: number }>();
    for (const sale of sales) {
      const day = sale.createdAt.toISOString().slice(0, 10);
      const bucket = byDay.get(day) ?? { total: 0, count: 0 };
      bucket.total += Number(sale.total);
      bucket.count += 1;
      byDay.set(day, bucket);
    }

    return Array.from(byDay.entries()).map(([day, bucket]) => ({
      day,
      total: bucket.total,
      transactionCount: bucket.count,
    }));
  }

  async salesByPaymentMethod(businessId: string, from?: string, to?: string) {
    const createdAt = dateRangeFilter(from, to);
    const sales = await this.prisma.sale.findMany({
      where: { businessId, cancelled: false, ...(createdAt && { createdAt }) },
      select: { paymentMethod: true, total: true },
    });

    const totals = { cash: 0, card: 0, transfer: 0, other: 0 };
    for (const sale of sales) {
      totals[normalizePaymentMethod(sale.paymentMethod)] += Number(sale.total);
    }
    return totals;
  }

  async topProducts(
    businessId: string,
    from?: string,
    to?: string,
    limit = 10,
  ) {
    const createdAt = dateRangeFilter(from, to);
    const grouped = await this.prisma.saleItem.groupBy({
      by: ['productId'],
      where: {
        sale: { businessId, cancelled: false, ...(createdAt && { createdAt }) },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: limit,
    });

    const products = await this.prisma.product.findMany({
      where: { id: { in: grouped.map((g) => g.productId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(products.map((p) => [p.id, p.name]));

    return grouped.map((g) => ({
      productId: g.productId,
      productName: nameById.get(g.productId) ?? g.productId,
      quantity: Number(g._sum.quantity ?? 0),
      revenue: Number(g._sum.subtotal ?? 0),
    }));
  }

  async listSales(
    businessId: string,
    filters: {
      from?: string;
      to?: string;
      deviceId?: string;
      userId?: string;
      page: number;
      limit: number;
    },
  ) {
    const createdAt = dateRangeFilter(filters.from, filters.to);
    const where: Prisma.SaleWhereInput = {
      businessId,
      ...(createdAt && { createdAt }),
      ...(filters.deviceId && { deviceId: filters.deviceId }),
      ...(filters.userId && { userId: filters.userId }),
    };

    const [sales, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.sale.count({ where }),
    ]);

    return {
      data: sales,
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    };
  }

  cashSessions(
    businessId: string,
    filters: { status?: string; from?: string; to?: string },
  ) {
    const openedAt = dateRangeFilter(filters.from, filters.to);
    return this.prisma.cashSession.findMany({
      where: {
        businessId,
        ...(filters.status && { status: filters.status }),
        ...(openedAt && { openedAt }),
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  cashCuts(
    businessId: string,
    filters: { sessionId?: string; from?: string; to?: string },
  ) {
    const createdAt = dateRangeFilter(filters.from, filters.to);
    return this.prisma.cashCut.findMany({
      where: {
        session: { businessId },
        ...(filters.sessionId && { sessionId: filters.sessionId }),
        ...(createdAt && { createdAt }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cashOutflows(businessId: string, sessionId: string) {
    const session = await this.prisma.cashSession.findFirst({
      where: { businessId, id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('Sesión de caja no encontrada');
    }
    return this.prisma.cashOutflow.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  inventoryMovements(
    businessId: string,
    filters: { productId?: string; from?: string; to?: string },
  ) {
    const createdAt = dateRangeFilter(filters.from, filters.to);
    return this.prisma.inventoryMovement.findMany({
      where: {
        businessId,
        ...(filters.productId && { productId: filters.productId }),
        ...(createdAt && { createdAt }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async products(businessId: string, includeStock: boolean) {
    const products = await this.prisma.product.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
    if (!includeStock) return products;

    const movements = await this.prisma.inventoryMovement.groupBy({
      by: ['productId', 'type'],
      where: { businessId },
      _sum: { quantity: true },
    });
    const stockByProduct = new Map<string, number>();
    for (const movement of movements) {
      const signed =
        movement.type === 'OUT'
          ? -Number(movement._sum.quantity ?? 0)
          : Number(movement._sum.quantity ?? 0);
      stockByProduct.set(
        movement.productId,
        (stockByProduct.get(movement.productId) ?? 0) + signed,
      );
    }

    return products.map((product) => ({
      ...product,
      stock: stockByProduct.get(product.id) ?? 0,
    }));
  }

  users(businessId: string) {
    return this.usersService.findAllForBusinessAdmin(businessId);
  }
}
