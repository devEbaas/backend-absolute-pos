import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { extractBearerToken, hashApiKey } from '../crypto.util';

export interface AuthenticatedDevice {
  id: string;
  businessId: string;
  label: string;
}

declare module 'express' {
  interface Request {
    device?: AuthenticatedDevice;
  }
}

// Identifies which Electron install (register) is calling — used by the
// sync endpoints and any future device-scoped API. Separate concern from
// cashier login (local JWT, unchanged) — see absolute-electron-pos's
// auth.middleware.js for the precedent this mirrors.
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Token de dispositivo requerido');
    }

    const device = await this.prisma.device.findUnique({
      where: { apiKeyHash: hashApiKey(token) },
    });
    if (!device) {
      throw new UnauthorizedException('Token de dispositivo inválido');
    }

    req.device = {
      id: device.id,
      businessId: device.businessId,
      label: device.label,
    };

    // Fire-and-forget — a stale lastSeenAt by a few seconds is fine, and a
    // request shouldn't fail or slow down because this update lags.
    this.prisma.device
      .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);

    return true;
  }
}
