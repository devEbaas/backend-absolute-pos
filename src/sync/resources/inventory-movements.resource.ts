import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncResource } from '../sync-resource.interface';
import { insertOnceImmutable } from '../upsert-helpers';
import { InventoryMovementSyncItemDto } from '../dto/inventory-movement-sync-item.dto';

@Injectable()
export class InventoryMovementsResource implements SyncResource<InventoryMovementSyncItemDto> {
  readonly tableName = 'inventoryMovements';

  constructor(private readonly prisma: PrismaService) {}

  findManyByIds(ids: string[]) {
    return this.prisma.inventoryMovement.findMany({
      where: { id: { in: ids } },
    });
  }

  toPullDto(
    row: Awaited<
      ReturnType<InventoryMovementsResource['findManyByIds']>
    >[number],
  ) {
    return {
      uuid: row.id,
      productUuid: row.productId,
      type: row.type,
      quantity: Number(row.quantity),
      reference: row.reference,
      referenceUuid: null, // ver nota en el DTO — no se resuelve, es polimórfico localmente
      linkedProductName: row.linkedProductName,
      userUuid: row.userId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // userId es opcional de verdad (ajustes de sistema sin cajero asociado) —
  // si el uuid referenciado no existe todavía, se deja null en vez de
  // rechazar la fila.
  async upsertFromSync(
    businessId: string,
    _deviceId: string,
    dto: InventoryMovementSyncItemDto,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const user = dto.userUuid
        ? await tx.user.findUnique({ where: { id: dto.userUuid } })
        : null;

      const fields = {
        businessId,
        productId: dto.productUuid,
        type: dto.type,
        quantity: dto.quantity,
        reference: dto.reference ?? null,
        referenceId: null, // ver InventoryMovementSyncItemDto — no se sincroniza (polimórfico local)
        linkedProductName: dto.linkedProductName ?? null,
        userId: user?.id ?? null,
        createdAt: new Date(dto.createdAt),
      };
      await insertOnceImmutable(
        tx,
        tx.inventoryMovement,
        businessId,
        'inventoryMovements',
        dto.uuid,
        fields,
      );
    });
  }
}
