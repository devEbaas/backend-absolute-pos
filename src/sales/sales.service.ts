import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { businessError } from '../common/business-error';
import type { MobileAuthPayload } from '../common/guards/jwt-auth.guard';
import { round2, round4 } from '../common/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { manejaStock, StockService } from '../stock/stock.service';
import { CreateSaleDto } from './dto/create-sale.dto';

type Tx = Prisma.TransactionClient;

const EPS = 1e-9;

/** Unidad con la que se nombra el stock en los mensajes (specs/01 §9.4.3): según el tipo del producto de INVENTARIO. */
function unitOf(tipoVenta: string): string {
  const tipo = tipoVenta.trim().toUpperCase();
  return tipo === 'PESO' ? 'kg' : tipo === 'METRO' ? 'm' : 'piezas';
}

/** Una cantidad en un mensaje, sin ruido de flotantes (`1.7000000000000002` → `1.7`). */
function fmt(value: number): string {
  return String(round4(value));
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
  ) {}

  // specs/22 §4.1 (B1 + M1). Sale + SaleItems + movimientos de stock caen juntos o no caen (una sola transacción). Las
  // demás escrituras móviles son de una fila y reutilizan `upsertFromSync` de su recurso, que abre su propia
  // transacción; una venta es multi-fila y Prisma no admite transacciones anidadas, así que aquí se escribe la misma
  // forma de fila directamente dentro de UNA transacción y cada fila deja su `sync_log` (el escritorio la baja en su
  // siguiente sync).
  async create(auth: MobileAuthPayload, dto: CreateSaleDto) {
    try {
      return await this.prisma.$transaction(
        (tx) => this.createInTx(tx, auth, dto),
        { timeout: 15_000 },
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        // Dos peticiones simultáneas con el mismo `id` de venta: la segunda choca con la llave primaria. Se resuelve
        // como un reintento normal (devuelve la venta de la primera) en vez de fallar con un 500.
        const replay = await this.replay(this.prisma, auth, dto.id);
        if (replay) return replay;
        // Si la venta no existe, lo que chocó es el `id` de una LÍNEA ya usada por otra venta.
        throw idInUse();
      }
      throw e;
    }
  }

  private async createInTx(
    tx: Tx,
    auth: MobileAuthPayload,
    dto: CreateSaleDto,
  ) {
    const { businessId, userId, deviceId } = auth;
    const saleId = dto.id;

    // 1. Idempotencia.
    const replay = await this.replay(tx, auth, dto.id);
    if (replay) return replay;
    const lineIds = dto.items.map((i) => i.id);
    if (new Set(lineIds).size !== lineIds.length) {
      throw new BadRequestException(
        'Los identificadores de las líneas deben ser únicos',
      );
    }

    // 2. Sesión de caja: debe existir, ser propia (usuario y dispositivo) y estar abierta.
    const owned = await tx.cashSession.findFirst({
      where: { id: dto.sessionId, businessId, userId, deviceId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('Sesión no encontrada');
    // Fila de la sesión bloqueada en modo compartido: un corte que la cierre a la vez (lo hace en modo exclusivo)
    // espera a que esta venta termine, así que ninguna venta queda fuera del corte ni dentro de una sesión ya cerrada.
    await tx.$queryRaw`SELECT id FROM cash_sessions WHERE id = ${dto.sessionId}::uuid FOR SHARE`;
    const session = await tx.cashSession.findUniqueOrThrow({
      where: { id: dto.sessionId },
    });
    if (session.status !== 'open') {
      throw businessError(
        HttpStatus.CONFLICT,
        'La sesión ya está cerrada',
        'SESSION_CLOSED',
      );
    }

    // 3. Productos de las líneas y, si son presentaciones, sus padres (el inventario vive en el padre).
    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const products = await tx.product.findMany({
      where: { businessId, id: { in: productIds } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const item of dto.items) {
      if (!byId.has(item.productId)) {
        throw new NotFoundException(
          `Producto con ID ${item.productId} no encontrado`,
        );
      }
    }
    const parentIds = [
      ...new Set(
        products.flatMap((p) => (p.parentProductId ? [p.parentProductId] : [])),
      ),
    ].filter((id) => !byId.has(id));
    if (parentIds.length > 0) {
      const parents = await tx.product.findMany({
        where: { businessId, id: { in: parentIds } },
      });
      parents.forEach((p) => byId.set(p.id, p));
    }

    // 4. El plan de cada línea: qué producto de inventario se afecta y cuántas unidades.
    interface Line {
      itemId: string;
      product: (typeof products)[number];
      quantity: number;
      unitPrice: number;
      subtotal: number;
      isLinked: boolean;
      inventoryProductId: string;
      unitsToDeduct: number;
      touchesStock: boolean;
    }
    const lines: Line[] = dto.items.map((item) => {
      const product = byId.get(item.productId)!;
      const isLinked = product.parentProductId !== null;
      const inventoryProductId = isLinked
        ? product.parentProductId!
        : product.id;
      if (isLinked && !byId.has(inventoryProductId)) {
        throw new NotFoundException(
          `Producto padre del vinculado ID ${product.id} no encontrado`,
        );
      }
      const tipo = (product.tipoVenta || 'UNIDAD').trim().toUpperCase();
      // specs/01 §9.4.4: `PRECIO_LIBRE` → el precio ES el subtotal; el resto, precio × cantidad. Se ignora el del cliente.
      const subtotal = round2(
        tipo === 'PRECIO_LIBRE'
          ? item.unitPrice
          : item.unitPrice * item.quantity,
      );
      return {
        itemId: item.id,
        product,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal,
        isLinked,
        inventoryProductId,
        unitsToDeduct: isLinked
          ? item.quantity * Number(product.unitsPerPack)
          : item.quantity,
        // `manejaStock` se evalúa con el tipo del producto VENDIDO: una presentación es UNIDAD, siempre maneja stock.
        touchesStock: manejaStock(product.tipoVenta),
      };
    });

    // 5. Stock: se bloquea la fila de cada producto de inventario afectado (así dos cajas no pueden vender la misma
    //    última unidad) y se lee DENTRO de la transacción, ya con el bloqueo. Las líneas repetidas se acumulan
    //    (specs/01 §9.4.3, T14).
    const lockIds = [
      ...new Set(
        lines.filter((l) => l.touchesStock).map((l) => l.inventoryProductId),
      ),
    ].sort(); // siempre en el mismo orden: evita interbloqueos entre ventas simultáneas
    if (lockIds.length > 0) {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ANY(${lockIds}::uuid[]) ORDER BY id FOR UPDATE`;
    }
    const available = await this.stock.stockByProduct(tx, businessId, lockIds);
    for (const line of lines) {
      if (!line.touchesStock) continue;
      const inventory = byId.get(line.inventoryProductId)!;
      const stock = available.get(line.inventoryProductId) ?? 0;
      if (stock + EPS < line.unitsToDeduct) {
        const u = unitOf(inventory.tipoVenta);
        throw businessError(
          HttpStatus.CONFLICT,
          `Stock insuficiente para ${inventory.name}. Disponible: ${fmt(stock)} ${u}, Necesario: ${fmt(line.unitsToDeduct)} ${u}`,
          'INSUFFICIENT_STOCK',
          { productId: inventory.id, available: round4(stock) },
        );
      }
      available.set(line.inventoryProductId, stock - line.unitsToDeduct);
    }

    // 6. Total: Σ de subtotales recalculados − descuento.
    const subtotal = round2(lines.reduce((sum, l) => sum + l.subtotal, 0));
    const discount = round2(dto.discountAmount ?? 0);
    if (discount > subtotal + EPS) {
      throw new BadRequestException(
        'El descuento no puede ser mayor al subtotal',
      );
    }
    const total = round2(subtotal - discount);

    // 7. Escritura.
    const now = new Date();
    await tx.sale.create({
      data: {
        id: saleId,
        businessId,
        deviceId,
        userId,
        total,
        paymentMethod: dto.paymentMethod,
        registerId: session.registerId,
        sessionId: dto.sessionId,
        cancelled: false,
        discountAmount: discount,
        paymentAmount: dto.paymentAmount ?? null,
        changeAmount: dto.changeAmount ?? null,
        createdAt: now,
        updatedAt: now,
      },
    });
    await tx.syncLogEntry.create({
      data: { businessId, tableName: 'sales', rowId: saleId },
    });

    for (const line of lines) {
      const linkedProductName = line.isLinked ? line.product.name : null;
      await tx.saleItem.create({
        data: {
          id: line.itemId,
          saleId,
          productId: line.product.id,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
          linkedProductName,
        },
      });
      await tx.syncLogEntry.create({
        data: { businessId, tableName: 'saleItems', rowId: line.itemId },
      });

      // `PRECIO_LIBRE` y `SERVICIO` no descuentan ni generan movimiento (T18).
      if (!line.touchesStock) continue;
      const movementId = randomUUID();
      await tx.inventoryMovement.create({
        data: {
          id: movementId,
          businessId,
          productId: line.inventoryProductId,
          type: 'OUT',
          quantity: line.unitsToDeduct,
          reference: 'sale',
          referenceId: saleId,
          linkedProductName,
          userId,
          createdAt: now,
        },
      });
      await tx.syncLogEntry.create({
        data: {
          businessId,
          tableName: 'inventoryMovements',
          rowId: movementId,
        },
      });
    }

    return {
      id: saleId,
      sessionId: dto.sessionId,
      registerId: session.registerId,
      paymentMethod: dto.paymentMethod,
      discountAmount: discount,
      total,
      paymentAmount: dto.paymentAmount ?? null,
      changeAmount: dto.changeAmount ?? null,
      cancelled: false,
      createdAt: now.toISOString(),
      items: lines.map((l) => ({
        id: l.itemId,
        productId: l.product.id,
        productName: l.product.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        subtotal: l.subtotal,
        linkedProductName: l.isLinked ? l.product.name : null,
      })),
    };
  }

  /**
   * Si el `id` ya existe: del mismo usuario y negocio → esa venta (un reintento no duplica nada); de otro → 409
   * `ID_IN_USE`. `null` si no existe.
   */
  private async replay(
    db: Pick<Tx, 'sale'>,
    auth: MobileAuthPayload,
    id: string,
  ) {
    const existing = await db.sale.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: { name: true } } } },
      },
    });
    if (!existing) return null;
    if (
      existing.businessId !== auth.businessId ||
      existing.userId !== auth.userId
    ) {
      throw idInUse();
    }
    return {
      id: existing.id,
      sessionId: existing.sessionId,
      registerId: existing.registerId,
      paymentMethod: existing.paymentMethod,
      discountAmount: Number(existing.discountAmount),
      total: Number(existing.total),
      paymentAmount:
        existing.paymentAmount === null ? null : Number(existing.paymentAmount),
      changeAmount:
        existing.changeAmount === null ? null : Number(existing.changeAmount),
      cancelled: existing.cancelled,
      createdAt: existing.createdAt.toISOString(),
      items: existing.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.product.name,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        subtotal: Number(i.subtotal),
        linkedProductName: i.linkedProductName,
      })),
    };
  }
}

function idInUse() {
  return businessError(
    HttpStatus.CONFLICT,
    'El identificador ya está en uso',
    'ID_IN_USE',
  );
}
