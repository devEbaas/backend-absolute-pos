import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

// Runs after JwtAuthGuard (relies on req.auth already being set). Gates
// endpoints that let an already-logged-in owner manage the business (e.g.
// POST /users) without needing MASTER_API_KEY for day-to-day operation.
@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.auth?.role !== 'admin') {
      throw new ForbiddenException('Requiere rol de administrador');
    }
    return true;
  }
}
