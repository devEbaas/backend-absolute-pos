import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncResource } from '../sync-resource.interface';
import { upsertMutable } from '../upsert-helpers';
import { UserSyncItemDto } from '../dto/user-sync-item.dto';

// Cashier identity for report attribution only — password_hash/reset_code
// never leave the device (the Postgres User model has no such column at
// all, so there's nothing to accidentally leak here).
@Injectable()
export class UsersResource implements SyncResource<UserSyncItemDto> {
  readonly tableName = 'users';

  constructor(private readonly prisma: PrismaService) {}

  findManyByIds(ids: string[]) {
    return this.prisma.user.findMany({ where: { id: { in: ids } } });
  }

  toPullDto(row: Awaited<ReturnType<UsersResource['findManyByIds']>>[number]) {
    return {
      uuid: row.id,
      name: row.name,
      username: row.username,
      role: row.role,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async upsertFromSync(
    businessId: string,
    _deviceId: string,
    dto: UserSyncItemDto,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const fields = {
        businessId,
        name: dto.name,
        username: dto.username,
        role: dto.role,
        active: dto.active,
        createdAt: new Date(dto.createdAt),
        updatedAt: new Date(dto.updatedAt),
      };
      await upsertMutable(
        tx,
        tx.user,
        businessId,
        'users',
        dto.uuid,
        fields,
        new Date(dto.updatedAt),
      );
    });
  }
}
