import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SyncGateway } from '../realtime/sync.gateway';
import { CreateQuoteDto, QuoteItemInputDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Mismo criterio que isQuoteExpired() en quotes.logic.js del desktop:
// "vencida" no es un status guardado, se calcula al vuelo — para no
// generar escrituras espontáneas que compliquen el sync entre dispositivos.
function isQuoteExpired(
  status: string,
  validUntil: string | null,
  ref = today(),
): boolean {
  return status === 'open' && validUntil != null && validUntil < ref;
}

const QUOTE_INCLUDE = {
  items: {
    include: {
      product: { select: { name: true, barcode: true, tipoVenta: true } },
    },
  },
  user: { select: { name: true } },
} satisfies Prisma.QuoteInclude;

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: SyncGateway,
  ) {}

  // Avisa a las cajas físicas del negocio para que hagan un pull inmediato
  // en vez de esperar su próximo ciclo de polling (hasta 5 min de backoff) —
  // mismo mecanismo que SyncService.push() usa para avisarle a las cajas
  // hermanas de un device. Acá no hay deviceId que excluir: el dashboard no
  // es un cliente WebSocket, así que se notifica a todos los dispositivos
  // conectados del negocio.
  private notifyQuotesChanged(businessId: string) {
    this.realtime.notifyBusiness(businessId, '', 'quotes');
  }

  async findAllForBusiness(
    businessId: string,
    filters: {
      status?: string;
      includeHidden: boolean;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      page: number;
      limit: number;
    },
  ) {
    const ref = today();
    const and: Prisma.QuoteWhereInput[] = [];

    if (filters.status === 'expired') {
      and.push({ status: 'open' }, { validUntil: { not: null, lt: ref } });
    } else if (filters.status === 'open') {
      and.push(
        { status: 'open' },
        { OR: [{ validUntil: null }, { validUntil: { gte: ref } }] },
      );
    } else if (filters.status) {
      and.push({ status: filters.status });
    }

    if (filters.search) {
      and.push({
        OR: [
          { customerName: { contains: filters.search, mode: 'insensitive' } },
          { customerPhone: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }

    if (filters.dateFrom || filters.dateTo) {
      and.push({
        createdAt: {
          ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
          ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
        },
      });
    }

    const where: Prisma.QuoteWhereInput = {
      businessId,
      ...(filters.includeHidden ? {} : { hidden: false }),
      ...(and.length > 0 && { AND: and }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        include: QUOTE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.quote.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        ...row,
        isExpired: isQuoteExpired(row.status, row.validUntil, ref),
      })),
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    };
  }

  async findOneForBusiness(businessId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { businessId, id },
      include: QUOTE_INCLUDE,
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada');
    return {
      ...quote,
      isExpired: isQuoteExpired(quote.status, quote.validUntil),
    };
  }

  // Valida que cada producto exista y pertenezca al negocio, y arma el
  // renglón (con subtotal y linked_product_name calculados del lado del
  // servidor, nunca confiados del cliente — mismo criterio que
  // insertQuoteItems() en quotes.logic.js del desktop).
  private async buildItemRows(businessId: string, items: QuoteItemInputDto[]) {
    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await this.prisma.product.findMany({
      where: { businessId, id: { in: productIds } },
    });
    if (products.length !== productIds.length) {
      throw new NotFoundException('Uno o más productos no existen');
    }
    const productById = new Map(products.map((p) => [p.id, p]));

    return items.map((item) => {
      const product = productById.get(item.productId)!;
      return {
        id: randomUUID(),
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.quantity * item.unitPrice,
        linkedProductName: product.parentProductId ? product.name : null,
      };
    });
  }

  async create(
    businessId: string,
    deviceId: string | null,
    userId: string,
    dto: CreateQuoteDto,
  ) {
    const itemRows = await this.buildItemRows(businessId, dto.items);
    const subtotal = itemRows.reduce((sum, item) => sum + item.subtotal, 0);
    const discountAmount = dto.discountAmount ?? 0;
    const total = Math.max(0, subtotal - discountAmount);
    const now = new Date();
    const quoteId = randomUUID();

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.quote.create({
        data: {
          id: quoteId,
          businessId,
          deviceId,
          userId,
          customerName: dto.customerName ?? null,
          customerPhone: dto.customerPhone ?? null,
          subtotal,
          discountAmount,
          total,
          status: 'open',
          validUntil: dto.validUntil ?? null,
          notes: dto.notes ?? null,
          hidden: false,
          // Sin dispositivo físico de por medio — distingue en reportes una
          // cotización armada desde el dashboard de una hecha en caja.
          registerId: 'DASHBOARD',
          createdAt: now,
          updatedAt: now,
        },
      });
      await tx.syncLogEntry.create({
        data: { businessId, tableName: 'quotes', rowId: quoteId },
      });

      for (const item of itemRows) {
        await tx.quoteItem.create({ data: { ...item, quoteId } });
        await tx.syncLogEntry.create({
          data: { businessId, tableName: 'quoteItems', rowId: item.id },
        });
      }

      return tx.quote.findUnique({
        where: { id: quoteId },
        include: QUOTE_INCLUDE,
      });
    });
    this.notifyQuotesChanged(businessId);
    return result;
  }

  async update(businessId: string, id: string, dto: UpdateQuoteDto) {
    const existing = await this.prisma.quote.findFirst({
      where: { businessId, id },
    });
    if (!existing) throw new NotFoundException('Cotización no encontrada');
    if (existing.status === 'converted') {
      throw new BadRequestException(
        'No se puede editar una cotización que ya fue convertida en venta',
      );
    }
    if (existing.status === 'cancelled') {
      throw new BadRequestException(
        'No se puede editar una cotización cancelada',
      );
    }

    const itemRows = await this.buildItemRows(businessId, dto.items);
    const subtotal = itemRows.reduce((sum, item) => sum + item.subtotal, 0);
    const discountAmount = dto.discountAmount ?? 0;
    const total = Math.max(0, subtotal - discountAmount);
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      // Reemplaza los items en vez de actualizarlos en sitio (mismo criterio
      // que updateQuote() en quotes.logic.js del desktop). Los items viejos
      // se borran directo en Postgres — a diferencia del desktop, acá no hay
      // límite de propagación: el borrado ocurre en la misma base que lee el
      // dashboard, así que no queda ningún renglón huérfano visible.
      await tx.quoteItem.deleteMany({ where: { quoteId: id } });
      for (const item of itemRows) {
        await tx.quoteItem.create({ data: { ...item, quoteId: id } });
        await tx.syncLogEntry.create({
          data: { businessId, tableName: 'quoteItems', rowId: item.id },
        });
      }

      await tx.quote.update({
        where: { id },
        data: {
          customerName: dto.customerName ?? null,
          customerPhone: dto.customerPhone ?? null,
          subtotal,
          discountAmount,
          total,
          validUntil: dto.validUntil ?? null,
          notes: dto.notes ?? null,
          updatedAt: now,
        },
      });
      await tx.syncLogEntry.create({
        data: { businessId, tableName: 'quotes', rowId: id },
      });

      return tx.quote.findUnique({ where: { id }, include: QUOTE_INCLUDE });
    });
    this.notifyQuotesChanged(businessId);
    return result;
  }

  async cancel(
    businessId: string,
    userId: string,
    id: string,
    reason?: string | null,
  ) {
    const existing = await this.prisma.quote.findFirst({
      where: { businessId, id },
    });
    if (!existing) throw new NotFoundException('Cotización no encontrada');
    if (existing.status === 'converted') {
      throw new BadRequestException(
        'No se puede cancelar una cotización que ya fue convertida en venta',
      );
    }
    if (existing.status === 'cancelled') {
      throw new BadRequestException('La cotización ya está cancelada');
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.quote.update({
        where: { id },
        data: {
          status: 'cancelled',
          cancelledAt: now,
          cancelledBy: userId,
          cancellationReason: reason ?? 'Sin motivo especificado',
          updatedAt: now,
        },
      });
      await tx.syncLogEntry.create({
        data: { businessId, tableName: 'quotes', rowId: id },
      });
      return tx.quote.findUnique({ where: { id }, include: QUOTE_INCLUDE });
    });
    this.notifyQuotesChanged(businessId);
    return result;
  }

  async setHidden(businessId: string, id: string, hidden: boolean) {
    const existing = await this.prisma.quote.findFirst({
      where: { businessId, id },
    });
    if (!existing) throw new NotFoundException('Cotización no encontrada');

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.quote.update({
        where: { id },
        data: { hidden, updatedAt: new Date() },
      });
      await tx.syncLogEntry.create({
        data: { businessId, tableName: 'quotes', rowId: id },
      });
      return tx.quote.findUnique({ where: { id }, include: QUOTE_INCLUDE });
    });
    this.notifyQuotesChanged(businessId);
    return result;
  }
}
