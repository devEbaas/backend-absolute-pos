import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, comparePassword } from '../common/password.util';
import { CreatePlatformAdminDto } from './dto/create-platform-admin.dto';
import { UpdatePlatformAdminDto } from './dto/update-platform-admin.dto';

@Injectable()
export class PlatformAdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async create(dto: CreatePlatformAdminDto) {
    const existing = await this.prisma.platformAdmin.findFirst({
      where: {
        OR: [
          { username: dto.username },
          ...(dto.email ? [{ email: dto.email }] : []),
        ],
      },
    });
    if (existing) {
      throw new ConflictException('Ese username o correo ya está en uso');
    }

    const admin = await this.prisma.platformAdmin.create({
      data: {
        name: dto.name,
        username: dto.username,
        email: dto.email,
        passwordHash: await hashPassword(dto.password),
      },
    });

    return {
      id: admin.id,
      name: admin.name,
      username: admin.username,
      email: admin.email,
    };
  }

  findAll() {
    return this.prisma.platformAdmin.findMany({
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findSelf(id: string) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id },
      select: { id: true, name: true, username: true, email: true },
    });
    if (!admin) {
      throw new NotFoundException('Platform admin no encontrado');
    }
    return admin;
  }

  async updateSelf(id: string, dto: UpdatePlatformAdminDto) {
    if (dto.email) {
      const existing = await this.prisma.platformAdmin.findUnique({
        where: { email: dto.email },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Ese correo ya está en uso');
      }
    }

    const admin = await this.prisma.platformAdmin.update({
      where: { id },
      data: { name: dto.name, email: dto.email },
      select: { id: true, name: true, username: true, email: true },
    });
    return admin;
  }

  // identifier: username o email, capturados en el mismo campo "Correo" del
  // login del dashboard — no todos los platform admins tienen email cargado
  // (ej. los creados antes de este campo, o por bootstrap manual vía SQL).
  async login(identifier: string, password: string) {
    const admin = await this.prisma.platformAdmin.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
    });
    if (!admin || !admin.active) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    const valid = await comparePassword(password, admin.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    // scope: "platform-admin" es lo único que PlatformAdminGuard exige, y lo
    // que lo distingue de un JWT de cajero (POST /auth/login) firmado con el
    // mismo secreto — ver el comentario en platform-admin.guard.ts.
    const token = await this.jwtService.signAsync({
      sub: admin.id,
      username: admin.username,
      scope: 'platform-admin',
    });

    return {
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        username: admin.username,
        email: admin.email,
      },
    };
  }
}
