import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { extractBearerToken } from '../crypto.util';

export interface MobileAuthPayload {
  userId: string;
  businessId: string;
  /**
   * `undefined` en el token del dashboard del dueño (`POST /business-admin/login`), que no pasa por un dispositivo.
   * Las rutas móviles usan {@link MobileAuthGuard}, que lo exige.
   */
  deviceId: string;
  role: string;
  username: string;
}

interface JwtClaims {
  sub?: string;
  businessId?: string;
  deviceId?: string;
  role: string;
  username: string;
  /** Solo lo llevan los tokens de administradores de plataforma (`POST /platform-admin/login`). */
  scope?: string;
}

declare module 'express' {
  interface Request {
    auth?: MobileAuthPayload;
  }
}

// Authenticates the JWT issued by POST /auth/login. The mobile write
// endpoints (sales, inventory, cash, products, users) trust this instead
// of DeviceAuthGuard because the token already carries businessId +
// deviceId (proven once at login) alongside the cashier identity needed
// for attribution — callers send one Bearer token per request, not a
// device key on every call.
//
// Tres tipos de JWT comparten el secreto (ver auth.module.ts): el de un dispositivo (`businessId` + `deviceId`), el del
// dashboard del dueño (`businessId`, sin `deviceId`) y el de administradores de plataforma (`scope`, sin `businessId`).
// Este guard acepta los dos de NEGOCIO y rechaza el de plataforma: con `businessId` indefinido Prisma descarta el filtro
// (`where: { businessId: undefined }` no filtra) y una lectura devolvería datos de TODOS los negocios.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Token requerido');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtClaims>(token);
      if (payload.scope || !payload.sub || !payload.businessId) {
        throw new Error('token de otro tipo');
      }
      req.auth = {
        userId: payload.sub,
        businessId: payload.businessId,
        deviceId: payload.deviceId as string,
        role: payload.role,
        username: payload.username,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}

// Las rutas de la app móvil (specs/22): además de un token de negocio exigen que venga de un DISPOSITIVO emparejado
// (`deviceId`). Sin él, "propio" (el dispositivo y el usuario del token) no significaría nada: el filtro por
// `deviceId: undefined` se descartaría y el dashboard del dueño podría escribir ventas y cajas sin dispositivo.
@Injectable()
export class MobileAuthGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.auth?.deviceId) {
      throw new ForbiddenException(
        'Requiere iniciar sesión desde un dispositivo emparejado',
      );
    }
    return true;
  }
}
