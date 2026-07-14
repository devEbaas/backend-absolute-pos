import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SYNC_RESOURCES, SyncResource } from './sync-resource.interface';
import { SyncPushDto } from './dto/sync-push.dto';

// Dependency order: parents committed before children within one push
// cycle, so FK lookups inside each resource's upsertFromSync() find what
// they need. Matches the worker's SYNC_TABLES order on the Electron side —
// keep both in sync when adding a table.
const TABLE_ORDER = [
  'users',
  'cashSessions',
  'products',
  'promotions',
  'promotionProducts',
  'sales',
  'saleItems',
  'saleCancellations',
  'inventoryMovements',
  'cashCuts',
  'cashOutflows',
] as const;

export interface PushResult {
  accepted: Record<string, string[]>;
  rejected: Record<string, { uuid: string; reason: string }[]>;
  serverTime: string;
}

@Injectable()
export class SyncService {
  private readonly resources: Map<string, SyncResource>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SYNC_RESOURCES) resources: SyncResource[],
  ) {
    this.resources = new Map(resources.map((r) => [r.tableName, r]));
  }

  // Every push handler calls the same *Resource.upsertFromSync() that a
  // future direct-write endpoint (dashboard/mobile) would call — this is
  // the "single write path per resource" from the plan, so sync and
  // direct writes can never drift apart.
  async push(
    businessId: string,
    deviceId: string,
    payload: SyncPushDto,
  ): Promise<PushResult> {
    const accepted: Record<string, string[]> = {};
    const rejected: Record<string, { uuid: string; reason: string }[]> = {};

    for (const table of TABLE_ORDER) {
      const rows = (payload as Record<string, { uuid: string }[] | undefined>)[
        table
      ];
      if (!rows?.length) continue;

      const resource = this.resources.get(table);
      if (!resource) continue;

      accepted[table] = [];
      rejected[table] = [];

      for (const item of rows) {
        try {
          await resource.upsertFromSync(businessId, deviceId, item);
          accepted[table].push(item.uuid);
        } catch (err) {
          rejected[table].push({
            uuid: item.uuid,
            reason: err instanceof Error ? err.message : 'unknown error',
          });
        }
      }
    }

    return { accepted, rejected, serverTime: new Date().toISOString() };
  }

  // Cursor is a monotonic seq from sync_log, not a timestamp — sidesteps
  // clock-skew/tie issues between devices entirely (see the plan's
  // reasoning). updated_at is only ever used for LWW conflict resolution,
  // never for pull pagination.
  async pull(
    businessId: string,
    since: number,
    tables: string[],
    limit: number,
  ) {
    const requested = tables.filter((t) => this.resources.has(t));

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

    const result: Record<string, unknown[]> = {};
    for (const table of requested) result[table] = [];

    for (const [table, ids] of idsByTable) {
      const resource = this.resources.get(table);
      if (!resource) continue;
      const rows = await resource.findManyByIds([...ids]);
      result[table] = rows.map((row) => resource.toPullDto(row));
    }

    const nextCursor =
      entries.length > 0 ? Number(entries[entries.length - 1].seq) : since;
    return { ...result, nextCursor, hasMore: entries.length === limit };
  }
}
