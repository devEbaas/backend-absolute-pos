import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { extractBearerToken, safeEqual } from '../crypto.util';

interface PlatformAdminJwtClaims {
  sub: string;
  username: string;
  scope: string;
}

// Gates the /admin/* bootstrap surface (businesses, devices, users) with
// EITHER credential: MASTER_API_KEY (operator on the VPS, emergency/CI use)
// OR a platform-admin JWT from pos-root-dashboard (day-to-day use). Nest
// composes @UseGuards(A, B) as AND, so this guard evaluates both manually
// and passes if either one succeeds — replaces the MasterKeyGuard-only
// version those controllers used before the dashboard existed.
@Injectable()
export class AdminAccessGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Token requerido');
    }

    const masterKey = process.env.MASTER_API_KEY;
    if (masterKey && safeEqual(token, masterKey)) {
      return true;
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<PlatformAdminJwtClaims>(token);
      if (payload.scope === 'platform-admin') {
        return true;
      }
    } catch {
      // cae al throw de abajo
    }

    throw new UnauthorizedException('Master key o token de admin inválido');
  }
}
