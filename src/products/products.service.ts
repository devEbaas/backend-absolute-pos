import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncResource } from '../sync/sync-resource.interface';
import { upsertMutable } from '../sync/upsert-helpers';
import { ProductSyncItemDto } from '../sync/dto/product-sync-item.dto';

@Injectable()
export class ProductsService implements SyncResource<ProductSyncItemDto> {
  readonly tableName = 'products';

  constructor(private readonly prisma: PrismaService) {}

  findMany(businessId: string) {
    return this.prisma.product.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findManyByIds(ids: string[]) {
    return this.prisma.product.findMany({ where: { id: { in: ids } } });
  }

  findOne(businessId: string, id: string) {
    return this.prisma.product.findFirst({ where: { businessId, id } });
  }

  toPullDto(
    row: Awaited<ReturnType<ProductsService['findManyByIds']>>[number],
  ) {
    return {
      uuid: row.id,
      barcode: row.barcode,
      name: row.name,
      description: row.description,
      salePrice: Number(row.salePrice),
      purchaseCost: Number(row.purchaseCost),
      tipoVenta: row.tipoVenta,
      imagePath: row.imagePath,
      active: row.active,
      parentProductUuid: row.parentProductId,
      unitsPerPack: Number(row.unitsPerPack),
      location: row.location,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // Single write path for products, shared by the sync push endpoint and
  // (eventually) any direct product-creation endpoint — see the plan's
  // "single write path per resource" requirement. Idempotent by uuid
  // (dto.uuid becomes the Postgres PK directly), last-write-wins by
  // updatedAt for conflicting concurrent edits from different devices.
  async upsertFromSync(
    businessId: string,
    _deviceId: string,
    dto: ProductSyncItemDto,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // El padre puede no haber llegado todavía a la nube si el batch no
      // respeta el orden padre-antes-que-hijo. Dejarlo en null es seguro —
      // se resuelve solo en un push/pull posterior una vez que el padre
      // exista, en vez de fallar el batch completo.
      const parent = dto.parentProductUuid
        ? await tx.product.findUnique({ where: { id: dto.parentProductUuid } })
        : null;

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
        parentProductId: parent?.id ?? null,
        unitsPerPack: dto.unitsPerPack,
        location: dto.location ?? null,
        createdAt: new Date(dto.createdAt),
        updatedAt: new Date(dto.updatedAt),
      };

      await upsertMutable(
        tx,
        tx.product,
        businessId,
        'products',
        dto.uuid,
        fields,
        new Date(dto.updatedAt),
      );
    });
  }
}
