import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { SyncPushDto } from './dto/sync-push.dto';

// Tables this endpoint can pull. Extend as A6 wires up the remaining
// entities — each addition is a new case in the `pull` switch below plus
// a line here, nothing else in the request/response shape changes.
const PULLABLE_TABLES = ['products'] as const;
type PullableTable = (typeof PULLABLE_TABLES)[number];

export interface PushResult {
  accepted: string[];
  rejected: { uuid: string; reason: string }[];
  serverTime: string;
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  // Every push handler below calls the same *Service.upsertFromSync()
  // that a future direct-write endpoint (dashboard/mobile) would call —
  // this is the "single write path per resource" from the plan, so sync
  // and direct writes can never drift apart.
  async push(businessId: string, payload: SyncPushDto): Promise<PushResult> {
    const accepted: string[] = [];
    const rejected: { uuid: string; reason: string }[] = [];

    for (const item of payload.products ?? []) {
      try {
        await this.products.upsertFromSync(businessId, item);
        accepted.push(item.uuid);
      } catch (err) {
        rejected.push({
          uuid: item.uuid,
          reason: err instanceof Error ? err.message : 'unknown error',
        });
      }
    }

    return { accepted, rejected, serverTime: new Date().toISOString() };
  }

  // Cursor is a monotonic seq from sync_log, not a timestamp — sidesteps
  // clock-skew/tie issues between devices entirely (see the plan's
  // reasoning). updated_at is only ever used for LWW conflict
  // resolution, never for pull pagination.
  async pull(
    businessId: string,
    since: number,
    tables: string[],
    limit: number,
  ) {
    const requested = tables.filter((t): t is PullableTable =>
      (PULLABLE_TABLES as readonly string[]).includes(t),
    );

    const entries = await this.prisma.syncLogEntry.findMany({
      where: {
        businessId,
        tableName: { in: requested },
        seq: { gt: BigInt(since) },
      },
      orderBy: { seq: 'asc' },
      take: limit,
    });

    const idsByTable = new Map<string, Set<string>>();
    for (const entry of entries) {
      if (!idsByTable.has(entry.tableName))
        idsByTable.set(entry.tableName, new Set());
      idsByTable.get(entry.tableName)!.add(entry.rowId);
    }

    const result: Record<PullableTable, unknown[]> = { products: [] };
    for (const [table, ids] of idsByTable) {
      if (table === 'products') {
        const rows = await this.prisma.product.findMany({
          where: { id: { in: [...ids] } },
        });
        // Misma forma que el DTO de push (uuid/parentProductUuid), no los
        // nombres internos id/parentProductId de Postgres — el cliente no
        // debería tener que hablar dos "idiomas" distintos según la
        // dirección. Los Decimal de Prisma se convierten a number
        // explícitamente en vez de dejar que su toJSON() los serialice
        // como string.
        result.products = rows.map((row) => ({
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
        }));
      }
    }

    const nextCursor =
      entries.length > 0 ? Number(entries[entries.length - 1].seq) : since;
    return { ...result, nextCursor, hasMore: entries.length === limit };
  }
}
