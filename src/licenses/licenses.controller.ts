import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminAccessGuard } from '../common/guards/admin-access.guard';
import { DeviceAuthGuard } from '../common/guards/device-auth.guard';
import { LicensesService } from './licenses.service';

// Llamado por el desktop ya emparejado — mismo guard/estilo que
// DevicesSelfController.GET /devices/me. El deviceId sale del token, nunca
// del payload, así que un dispositivo solo puede pedir/ver su propia
// licencia.
@ApiTags('devices')
@ApiBearerAuth('bearer')
@UseGuards(DeviceAuthGuard)
@Controller('devices/license')
export class LicensesSelfController {
  constructor(private readonly licenses: LicensesService) {}

  @Post('request')
  request(@Req() req: Request) {
    return this.licenses.request(req.device!.id);
  }

  @Get()
  getStatus(@Req() req: Request) {
    return this.licenses.getStatus(req.device!.id);
  }
}

// Bandeja de solicitudes para pos-root-dashboard — mismo guard que
// BusinessesController/DevicesAdminController (master key o JWT de
// platform-admin).
@ApiTags('admin/licenses')
@ApiBearerAuth('bearer')
@UseGuards(AdminAccessGuard)
@Controller('admin/license-requests')
export class LicensesAdminController {
  constructor(private readonly licenses: LicensesService) {}

  @Get()
  findAll(@Query('status') status?: string) {
    return this.licenses.findAll(status);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Req() req: Request) {
    // undefined cuando se autentica con MASTER_API_KEY (no hay un admin
    // asociado a esa credencial) — LicensesService.approve acepta null.
    return this.licenses.approve(id, req.platformAdmin?.id ?? null);
  }

  @Post(':id/revoke')
  revoke(@Param('id') id: string) {
    return this.licenses.revoke(id);
  }
}
