// Every syncable table implements this so SyncService can push/pull it
// generically — adding a table means writing one resource class, not
// touching sync.service.ts.
export interface SyncResource<TDto = any> {
  tableName: string;
  upsertFromSync(
    businessId: string,
    deviceId: string,
    dto: TDto,
  ): Promise<void>;
  findManyByIds(ids: string[]): Promise<unknown[]>;
  toPullDto(row: unknown): unknown;
}

export const SYNC_RESOURCES = 'SYNC_RESOURCES';
