import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  // Sale + its SaleItems + the stock-out InventoryMovements must land
  // together or not at all. Every other mobile endpoint in this MVP is a
  // single row, so calling the matching sync resource's upsertFromSync
  // directly is already atomic (see products/inventory/cash). A sale is
  // multi-row, and those resources each open their own $transaction (see
  // sync/upsert-helpers.ts) — nesting Prisma transactions isn't supported,
  // so rather than retrofit cross-transaction support into the sync
  // engine, this writes the identical field shape those resources
  // produce directly inside one transaction, logging each row to
  // sync_log itself so desktop installs still pull it on their next sync.
  async create(
    businessId: string,
    deviceId: string,
    userId: string,
    dto: CreateSaleDto,
  ) {
    const now = new Date();
    const total =
      dto.items.reduce((sum, item) => sum + item.subtotal, 0) -
      (dto.discountAmount ?? 0);
    const saleId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const productIds = [...new Set(dto.items.map((item) => item.productId))];
      const products = await tx.product.findMany({
        where: { businessId, id: { in: productIds } },
      });
      if (products.length !== productIds.length) {
        throw new NotFoundException('Uno o más productos no existen');
      }

      await tx.sale.create({
        data: {
          id: saleId,
          businessId,
          deviceId,
          userId,
          total,
          paymentMethod: dto.paymentMethod,
          registerId: dto.registerId ?? 'PRINCIPAL',
          sessionId: dto.sessionId ?? null,
          cancelled: false,
          discountAmount: dto.discountAmount ?? 0,
          createdAt: now,
          updatedAt: now,
        },
      });
      await tx.syncLogEntry.create({
        data: { businessId, tableName: 'sales', rowId: saleId },
      });

      for (const item of dto.items) {
        const itemId = randomUUID();
        await tx.saleItem.create({
          data: {
            id: itemId,
            saleId,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            linkedProductName: item.linkedProductName ?? null,
          },
        });
        await tx.syncLogEntry.create({
          data: { businessId, tableName: 'saleItems', rowId: itemId },
        });

        // Mirrors absolute-electron-pos's sales route: type OUT,
        // reference 'sale' (see src/main/http/routes/sales.routes.js).
        // Stock validation (insufficient-stock rejection) is deferred —
        // not part of this MVP's scope.
        const movementId = randomUUID();
        await tx.inventoryMovement.create({
          data: {
            id: movementId,
            businessId,
            productId: item.productId,
            type: 'OUT',
            quantity: item.quantity,
            reference: 'sale',
            referenceId: null,
            linkedProductName: item.linkedProductName ?? null,
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

      return tx.sale.findUnique({
        where: { id: saleId },
        include: { items: true },
      });
    });
  }
}
