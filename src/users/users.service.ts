import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../common/password.util';
import { generateTempPassword } from '../common/crypto.util';
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

    // Si no se manda password (caso normal desde pos-root-dashboard, cuyo
    // modal de alta no la pide) se genera una y se devuelve en claro una
    // sola vez — igual que el device api key o el pairing code.
    const temporaryPassword = dto.password ?? generateTempPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const now = new Date();

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          id: randomUUID(),
          businessId,
          name: dto.name,
          username: dto.username,
          email: dto.email,
          phone: dto.phone,
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
        data: { businessId, tableName: 'users', rowId: created.id },
      });
      return created;
    });

    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      role: user.role,
      active: user.active,
      // Solo presente cuando dto.password vino vacío — el llamador (curl con
      // master key) que sí manda su propia password no necesita que se le
      // repita de vuelta.
      ...(dto.password ? {} : { temporaryPassword }),
    };
  }

  // Usado por el picker de login mobile (UsersController, gateado por
  // DeviceAuthGuard) — un dispositivo sin autenticar como admin no debe ver
  // email/phone/status, solo lo mínimo para elegir con qué cuenta entrar.
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

  // Usado por pos-root-dashboard (UsersAdminController, gateado por
  // AdminAccessGuard) — sí puede ver los datos de contacto.
  findAllForBusinessAdmin(businessId: string) {
    return this.prisma.user.findMany({
      where: { businessId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        phone: true,
        role: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
