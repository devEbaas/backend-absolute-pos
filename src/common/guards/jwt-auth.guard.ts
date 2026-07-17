import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { extractBearerToken } from '../crypto.util';

export interface MobileAuthPayload {
  userId: string;
  businessId: string;
  deviceId: string;
  role: string;
  username: string;
}

interface JwtClaims {
  sub: string;
  businessId: string;
  deviceId: string;
  role: string;
  username: string;
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
      req.auth = {
        userId: payload.sub,
        businessId: payload.businessId,
        deviceId: payload.deviceId,
        role: payload.role,
        username: payload.username,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
