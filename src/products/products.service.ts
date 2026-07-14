import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductSyncItemDto } from '../sync/dto/product-sync-item.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  findMany(businessId: string) {
    return this.prisma.product.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Single write path for products, shared by the sync push endpoint and
  // (eventually) any direct product-creation endpoint — see the plan's
  // "single write path per resource" requirement. Idempotent by uuid
  // (dto.uuid becomes the Postgres PK directly), last-write-wins by
  // updatedAt for conflicting concurrent edits from different devices.
  async upsertFromSync(
    businessId: string,
    dto: ProductSyncItemDto,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({ where: { id: dto.uuid } });

      // El padre puede no haber llegado todavía a la nube si el batch no
      // respeta el orden padre-antes-que-hijo (o si el push del padre aún
      // no ocurrió desde el dispositivo origen). Dejarlo en null es
      // seguro — se resuelve solo en un push/pull posterior una vez que
      // el padre exista, en vez de fallar el batch completo.
      let parentProductId: string | null = null;
      if (dto.parentProductUuid) {
        const parent = await tx.product.findUnique({
          where: { id: dto.parentProductUuid },
        });
        parentProductId = parent?.id ?? null;
      }

      const fields = {
        businessId,
        barcode: dto.barcode ?? null,
        name: dto.name,
        description: dto.description ?? null,
        salePrice: dto.salePrice,
        purchaseCost: dto.purchaseCost,
        tipoVenta: dto.tipoVenta,
        imagePath: dto.imagePath ?? null,
        active: dto.active,
        parentProductId,
        unitsPerPack: dto.unitsPerPack,
        location: dto.location ?? null,
        createdAt: new Date(dto.createdAt),
        updatedAt: new Date(dto.updatedAt),
      };

      if (!existing) {
        const created = await tx.product.create({
          data: { id: dto.uuid, ...fields },
        });
        await tx.syncLogEntry.create({
          data: { businessId, tableName: 'products', rowId: created.id },
        });
        return;
      }

      if (new Date(dto.updatedAt).getTime() <= existing.updatedAt.getTime()) {
        // Last-write-wins: lo que ya está en la nube es igual o más
        // reciente que lo que llegó — no se aplica, pero tampoco es un
        // error (el push sigue siendo "aceptado").
        return;
      }

      const updated = await tx.product.update({
        where: { id: dto.uuid },
        data: fields,
      });
      await tx.syncLogEntry.create({
        data: { businessId, tableName: 'products', rowId: updated.id },
      });
    });
  }
}
