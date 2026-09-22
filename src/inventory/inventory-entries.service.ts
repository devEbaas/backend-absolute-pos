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
import { round4 } from '../common/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { manejaStock } from '../stock/stock.service';
import { CreateInventoryEntryDto } from './dto/create-inventory-entry.dto';

type Tx = Prisma.TransactionClient;

const ENTRY_REFERENCE = 'PRODUCT_ENTRY';

export interface EntryProcessed {
  movementId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitsAdded: number;
  isLinked: boolean;
}

@Injectable()
export class InventoryEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  // specs/22 §5 (B2) — todas las líneas o ninguna (specs/04 §6). Reemplaza las N llamadas no atómicas y no idempotentes a
  // `POST /inventory-movements`.
  async create(auth: MobileAuthPayload, dto: CreateInventoryEntryDto) {
    return this.prisma.$transaction((tx) => this.createInTx(tx, auth, dto), {
      timeout: 15_000,
    });
  }

  private async createInTx(
    tx: Tx,
    auth: MobileAuthPayload,
    dto: CreateInventoryEntryDto,
  ) {
    const { businessId, userId } = auth;
    const entryId = dto.id;

    // Idempotencia. No hay una restricción única sobre `referenceId`, así que dos peticiones simultáneas con el mismo
    // `id` se serializan con un candado de aplicación: la segunda ya ve los movimientos de la primera y los devuelve.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`entry:${entryId}`}, 0))`;
    const replay = await this.replay(tx, auth, entryId);
    if (replay) return replay;

    // Productos de las líneas y, si son presentaciones, sus padres.
    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const products = await tx.product.findMany({
      where: { businessId, id: { in: productIds } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
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

    // Se valida TODO antes de escribir nada (04 §6, pasos 1–3), en el orden de las líneas.
    const plan = dto.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) {
        throw new NotFoundException(
          `Producto con ID ${item.productId} no encontrado`,
        );
      }
      // Cubre `PRECIO_LIBRE` y `SERVICIO`: no llevan inventario.
      if (!manejaStock(product.tipoVenta)) {
        throw new BadRequestException(
          `Los productos de precio variable no manejan inventario. Producto: ${product.name}`,
        );
      }
      const isLinked = product.parentProductId !== null;
      const inventoryProductId = isLinked
        ? product.parentProductId!
        : product.id;
      if (isLinked && !byId.has(inventoryProductId)) {
        throw new NotFoundException(
          `Producto padre del vinculado "${product.name}" no encontrado`,
        );
      }
      return {
        product,
        quantity: item.quantity,
        isLinked,
        inventoryProductId,
        // La presentación se traduce a: producto = padre, cantidad = qty × unitsPerPack (specs/00 §Modelo de stock).
        unitsToAdd: isLinked
          ? item.quantity * Number(product.unitsPerPack)
          : item.quantity,
      };
    });

    const now = new Date();
    const entriesProcessed: EntryProcessed[] = [];
    for (const line of plan) {
      const movementId = randomUUID();
      await tx.inventoryMovement.create({
        data: {
          id: movementId,
          businessId,
          productId: line.inventoryProductId,
          type: 'IN',
          quantity: line.unitsToAdd,
          reference: ENTRY_REFERENCE,
          referenceId: entryId,
          linkedProductName: line.isLinked ? line.product.name : null,
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
      entriesProcessed.push({
        movementId,
        productId: line.product.id,
        productName: line.product.name,
        quantity: line.quantity,
        unitsAdded: line.unitsToAdd,
        isLinked: line.isLinked,
      });
    }

    return {
      entryId,
      createdAt: now.toISOString(),
      totalItems: plan.length,
      // Suma de lo CAPTURADO (no de `unitsAdded`): es lo que el cajero ve en el resumen (04 §6, Salida).
      totalQuantity: round4(plan.reduce((sum, l) => sum + l.quantity, 0)),
      entriesProcessed,
    };
  }

  /**
   * Si ya hay movimientos con ese `entryId`: del mismo usuario y negocio → la misma respuesta (un reintento no suma
   * dos veces); de otro → 409 `ID_IN_USE`. `null` si no hay ninguno.
   *
   * La respuesta se reconstruye desde los movimientos: la línea original (la presentación y su cantidad de captura) no
   * se guardó, así que se recupera por el padre y el nombre de la presentación (`linkedProductName`). El ORDEN de
   * `entriesProcessed` en un reintento no está garantizado.
   */
  private async replay(tx: Tx, auth: MobileAuthPayload, entryId: string) {
    const movements = await tx.inventoryMovement.findMany({
      where: { referenceId: entryId, reference: ENTRY_REFERENCE },
      include: { product: true },
      orderBy: { id: 'asc' },
    });
    if (movements.length === 0) return null;
    if (
      movements.some(
        (m) => m.businessId !== auth.businessId || m.userId !== auth.userId,
      )
    ) {
      throw businessError(
        HttpStatus.CONFLICT,
        'El identificador ya está en uso',
        'ID_IN_USE',
      );
    }

    const entriesProcessed: EntryProcessed[] = [];
    for (const m of movements) {
      const unitsAdded = Number(m.quantity);
      if (m.linkedProductName) {
        const presentation = await tx.product.findFirst({
          where: {
            businessId: auth.businessId,
            parentProductId: m.productId,
            name: m.linkedProductName,
          },
          orderBy: { createdAt: 'asc' },
        });
        const perPack = Number(presentation?.unitsPerPack ?? 1) || 1;
        entriesProcessed.push({
          movementId: m.id,
          productId: presentation?.id ?? m.productId,
          productName: m.linkedProductName,
          quantity: round4(unitsAdded / perPack),
          unitsAdded,
          isLinked: true,
        });
      } else {
        entriesProcessed.push({
          movementId: m.id,
          productId: m.productId,
          productName: m.product.name,
          quantity: unitsAdded,
          unitsAdded,
          isLinked: false,
        });
      }
    }
    return {
      entryId,
      createdAt: movements[0].createdAt.toISOString(),
      totalItems: entriesProcessed.length,
      totalQuantity: round4(
        entriesProcessed.reduce((sum, e) => sum + e.quantity, 0),
      ),
      entriesProcessed,
    };
  }
}
