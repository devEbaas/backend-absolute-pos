import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, comparePassword } from '../common/password.util';
import { CreatePlatformAdminDto } from './dto/create-platform-admin.dto';

@Injectable()
export class PlatformAdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async create(dto: CreatePlatformAdminDto) {
    const existing = await this.prisma.platformAdmin.findUnique({
      where: { username: dto.username },
    });
    if (existing) {
      throw new ConflictException('Ese username ya está en uso');
    }

    const admin = await this.prisma.platformAdmin.create({
      data: {
        name: dto.name,
        username: dto.username,
        passwordHash: await hashPassword(dto.password),
      },
    });

    return { id: admin.id, name: admin.name, username: admin.username };
  }

  findAll() {
    return this.prisma.platformAdmin.findMany({
      select: {
        id: true,
        name: true,
        username: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async login(username: string, password: string) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { username },
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
      admin: { id: admin.id, name: admin.name, username: admin.username },
    };
  }
}
