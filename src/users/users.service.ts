import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../common/password.util';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Deliberately separate from UsersResource.upsertFromSync
  // (sync/resources/users.resource.ts), which processes /sync/push and
  // must never be able to set a password — this is the only place
  // passwordHash is ever written. Uniqueness is checked at the app level
  // against passwordHash-bearing rows only, so it never collides with the
  // desktop-synced "shadow" rows that intentionally share usernames across
  // devices (see prisma/schema.prisma).
  async create(businessId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        businessId,
        username: dto.username,
        passwordHash: { not: null },
      },
    });
    if (existing) {
      throw new ConflictException('El nombre de usuario ya existe');
    }

    const passwordHash = await hashPassword(dto.password);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: randomUUID(),
          businessId,
          name: dto.name,
          username: dto.username,
          passwordHash,
          role: dto.role ?? 'cashier',
          active: true,
          createdAt: now,
          updatedAt: now,
        },
      });
      // Logged to sync_log directly (not via upsertMutable, which this
      // create() doesn't use) so desktop installs still pull this cashier
      // down for report attribution, same as any other synced user.
      await tx.syncLogEntry.create({
        data: { businessId, tableName: 'users', rowId: user.id },
      });
      return {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        active: user.active,
      };
    });
  }

  findAllForBusiness(businessId: string) {
    return this.prisma.user.findMany({
      where: { businessId },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
