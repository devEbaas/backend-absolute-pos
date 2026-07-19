import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { comparePassword } from '../common/password.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // Only rows with a real passwordHash are login candidates — desktop-synced
  // shadow users (passwordHash always null, see prisma/schema.prisma) never
  // match, so a duplicate username between a shadow row and a cloud-native
  // account can't cause an ambiguous login.
  async login(
    businessId: string,
    deviceId: string,
    username: string,
    password: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { businessId, username, passwordHash: { not: null } },
    });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }
    if (!user.active) {
      throw new ForbiddenException(
        'Usuario inactivo. Contacta al administrador',
      );
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    const token = await this.jwtService.signAsync({
      sub: user.id,
      businessId,
      deviceId,
      role: user.role,
      username: user.username,
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
      },
    };
  }

  // Login del dashboard web del dueño de negocio — sin device de por medio,
  // así que el negocio se resuelve por slug en vez de por DeviceAuthGuard
  // (ver auth.controller.ts). Mismo criterio de "solo filas con passwordHash"
  // que login(), más el filtro role: 'admin' para que un cashier no entre.
  async loginOwner(businessSlug: string, username: string, password: string) {
    const business = await this.prisma.business.findUnique({
      where: { slug: businessSlug },
    });
    if (!business) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        businessId: business.id,
        username,
        passwordHash: { not: null },
        role: 'admin',
      },
    });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }
    if (!user.active) {
      throw new ForbiddenException(
        'Usuario inactivo. Contacta al administrador',
      );
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    const token = await this.jwtService.signAsync({
      sub: user.id,
      businessId: business.id,
      role: user.role,
      username: user.username,
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
      },
      business: { id: business.id, name: business.name, slug: business.slug },
    };
  }
}
