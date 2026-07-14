import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { extractBearerToken, safeEqual } from '../crypto.util';

// Protects the bootstrap/admin endpoints (creating businesses and devices).
// A single shared secret known only to the VPS operator (MASTER_API_KEY env
// var) — there is no dashboard yet to provision this through, so this guard
// is the entire admin surface for Phase A.
@Injectable()
export class MasterKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(req.headers.authorization);
    const masterKey = process.env.MASTER_API_KEY;

    if (!masterKey) {
      throw new UnauthorizedException(
        'MASTER_API_KEY no configurada en el servidor',
      );
    }
    if (!token || !safeEqual(token, masterKey)) {
      throw new UnauthorizedException('Master key inválida');
    }
    return true;
  }
}
