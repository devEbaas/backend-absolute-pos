import { Module } from '@nestjs/common';
import {
  PlatformAdminsBootstrapController,
  PlatformAdminsController,
  PlatformAuthController,
} from './platform-admins.controller';
import { PlatformAdminsService } from './platform-admins.service';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import { AdminAccessGuard } from '../common/guards/admin-access.guard';

@Module({
  controllers: [
    PlatformAdminsBootstrapController,
    PlatformAdminsController,
    PlatformAuthController,
  ],
  providers: [PlatformAdminsService, PlatformAdminGuard, AdminAccessGuard],
  // AdminAccessGuard es usado por BusinessesController/DevicesAdminController/
  // UsersAdminController en otros módulos — se exporta para que puedan
  // inyectarlo (necesita JwtService, no tiene sentido reconstruirlo por módulo).
  exports: [AdminAccessGuard],
})
export class PlatformAdminsModule {}
