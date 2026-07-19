import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { extractBearerToken, hashApiKey } from '../crypto.util';

interface AdminJwtClaims {
  sub: string;
  businessId: string;
  deviceId: string;
  role: string;
  username: string;
}

declare module 'express' {
  interface Request {
    businessId?: string;
  }
}

// Gates day-to-day cashier creation (POST /users) with EITHER credential,
// same "evaluate both manually, pass if either succeeds" pattern as
// AdminAccessGuard: a paired Electron install's device_api_key (today's only
// caller — see absolute-pos-app's users.ipc.js) OR an admin-role JWT from
// POST /auth/login (future owner/mobile app use, already issued today but
// unused by the desktop). Either way this only proves "acting on behalf of
// business X" — same trust boundary /sync/push already relies on.
@Injectable()
export class DeviceOrAdminGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Token requerido');
    }

    const device = await this.prisma.device.findUnique({
      where: { apiKeyHash: hashApiKey(token) },
    });
    if (device && !device.revokedAt) {
      req.businessId = device.businessId;
      this.prisma.device
        .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined);
      return true;
    }

    try {
      const payload = await this.jwtService.verifyAsync<AdminJwtClaims>(token);
      if (payload.role === 'admin') {
        req.businessId = payload.businessId;
        return true;
      }
    } catch {
      // cae al throw de abajo
    }

    throw new UnauthorizedException('Token de dispositivo o de admin inválido');
  }
}
