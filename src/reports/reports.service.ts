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

  // Mismo umbral que absolute-pos-mobile/src/utils/stock.ts y
  // pos-client-dashboard/src/lib/constants.ts — duplicado a propósito
  // (ninguno de los 3 comparte un paquete común), debe mantenerse igual
  // en los tres lugares si se cambia.
  private static readonly LOW_STOCK_THRESHOLD = 10;

  private stockStatusOf(stock: number): 'active' | 'low' | 'out' {
    if (stock <= 0) return 'out';
    if (stock <= ReportsService.LOW_STOCK_THRESHOLD) return 'low';
    return 'active';
  }

  // Mismo patrón de paginación que listSales (skip/take + count en
  // paralelo, misma forma de respuesta { data, page, limit, total,
  // totalPages }) para el camino sin stock. Cuando se pide stock, el
  // stock no es una columna — se deriva sumando InventoryMovement — así
  // que para poder filtrar por estado y contar un resumen hay que traer
  // todo el conjunto que matchea la búsqueda, clasificarlo, y recién ahí
  // paginar en memoria (mismo trade-off que ya aceptan
  // useResumenData.ts/useVentasData.ts al pedir hasta 1000 productos
  // completos del lado del frontend).
  async products(
    businessId: string,
    filters: {
      includeStock: boolean;
      search?: string;
      stockStatus?: 'active' | 'low' | 'out';
      page: number;
      limit: number;
    },
  ) {
    const where: Prisma.ProductWhereInput = {
      businessId,
      ...(filters.search && {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { barcode: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
    };

    if (!filters.includeStock) {
      const [products, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (filters.page - 1) * filters.limit,
          take: filters.limit,
        }),
        this.prisma.product.count({ where }),
      ]);
      return {
        data: products,
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      };
    }

    const products = await this.prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const movements = products.length
      ? await this.prisma.inventoryMovement.groupBy({
          by: ['productId', 'type'],
          where: { businessId, productId: { in: products.map((p) => p.id) } },
          _sum: { quantity: true },
        })
      : [];
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

    const withStock = products.map((product) => ({
      ...product,
      stock: stockByProduct.get(product.id) ?? 0,
    }));
    const statusById = new Map(
      withStock.map((p) => [p.id, this.stockStatusOf(p.stock)]),
    );

    const stockSummary = { active: 0, low: 0, out: 0 };
    for (const status of statusById.values()) {
      stockSummary[status] += 1;
    }

    const filtered = filters.stockStatus
      ? withStock.filter((p) => statusById.get(p.id) === filters.stockStatus)
      : withStock;
    const data = filtered.slice(
      (filters.page - 1) * filters.limit,
      filters.page * filters.limit,
    );

    return {
      data,
      page: filters.page,
      limit: filters.limit,
      total: filtered.length,
      totalPages: Math.ceil(filtered.length / filters.limit),
      stockSummary,
    };
  }

  users(businessId: string) {
    return this.usersService.findAllForBusinessAdmin(businessId);
  }
}
