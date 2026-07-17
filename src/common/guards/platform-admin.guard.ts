import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { extractBearerToken } from '../crypto.util';

export interface PlatformAdminAuthPayload {
  id: string;
  username: string;
}

interface PlatformAdminJwtClaims {
  sub: string;
  username: string;
  scope: string;
}

declare module 'express' {
  interface Request {
    platformAdmin?: PlatformAdminAuthPayload;
  }
}

// Authenticates the JWT issued by POST /platform-admin/login. Reuses the
// same JwtService/secret as JwtAuthGuard (AuthModule is @Global, see
// auth.module.ts) but requires scope === "platform-admin" — a cashier JWT
// from POST /auth/login never carries that claim, so it's rejected here,
// and a platform-admin JWT never carries businessId/deviceId/role, so
// AdminRoleGuard rejects it on the business side. Two disjoint token
// spaces sharing one secret, kept apart purely by claim shape.
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Token requerido');
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<PlatformAdminJwtClaims>(token);
      if (payload.scope !== 'platform-admin') {
        throw new UnauthorizedException('Token inválido o expirado');
      }
      req.platformAdmin = { id: payload.sub, username: payload.username };
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
