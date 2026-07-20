import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../common/password.util';
import { generateTempPassword } from '../common/crypto.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

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

  // Editar nombre/email/teléfono desde el dashboard del dueño
  // (docs/dashboard-cliente-design-brief.md §5.5) — no toca username,
  // password ni role, ver comentario en UpdateUserProfileDto. Mismo patrón
  // transacción+syncLogEntry que setActive()/create().
  async updateProfile(
    businessId: string,
    userId: string,
    dto: UpdateUserProfileDto,
  ) {
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, businessId },
    });
    if (!existing) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          updatedAt: new Date(),
        },
      });
      await tx.syncLogEntry.create({
        data: { businessId, tableName: 'users', rowId: user.id },
      });
      return user;
    });

    return {
      id: updated.id,
      name: updated.name,
      username: updated.username,
      email: updated.email,
      phone: updated.phone,
      role: updated.role,
      active: updated.active,
    };
  }

  // Activar/desactivar cajero desde el dashboard del dueño (reports-brief
  // §5.5) — soft toggle, mismo campo `active` que ya filtra el picker de
  // login mobile y AuthService.login()/loginOwner(). Mismo patrón
  // transacción+syncLogEntry que create(), para que un desktop pareado
  // también vea el cambio en su próximo pull.
  async setActive(businessId: string, userId: string, active: boolean) {
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, businessId },
    });
    if (!existing) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { active, updatedAt: new Date() },
      });
      await tx.syncLogEntry.create({
        data: { businessId, tableName: 'users', rowId: user.id },
      });
      return user;
    });

    return {
      id: updated.id,
      name: updated.name,
      username: updated.username,
      email: updated.email,
      phone: updated.phone,
      role: updated.role,
      active: updated.active,
    };
  }
}
