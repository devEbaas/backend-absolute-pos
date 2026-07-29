import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminAccessGuard } from '../common/guards/admin-access.guard';
import { CreateOfflineLicenseRequestDto } from './dto/create-offline-license-request.dto';
import { OfflineLicensesService } from './offline-licenses.service';

// Público — sin guard, igual que DemoRequestsPublicController. El
// hardwareId es la única identidad; no requiere que la instalación esté
// emparejada (a diferencia de LicensesSelfController, que usa DeviceAuthGuard).
@ApiTags('offline-licenses')
@Controller('offline-licenses')
export class OfflineLicensesPublicController {
  constructor(private readonly offlineLicenses: OfflineLicensesService) {}

  @Post('request')
  request(@Body() dto: CreateOfflineLicenseRequestDto) {
    return this.offlineLicenses.request(dto);
  }

  @Get('status/:hardwareId')
  getStatus(@Param('hardwareId') hardwareId: string) {
    return this.offlineLicenses.getStatus(hardwareId);
  }
}

// Bandeja de solicitudes para pos-root-dashboard — mismo guard que
// LicensesAdminController/DemoRequestsAdminController (master key o JWT de
// platform-admin).
@ApiTags('admin/offline-licenses')
@ApiBearerAuth('bearer')
@UseGuards(AdminAccessGuard)
@Controller('admin/offline-license-requests')
export class OfflineLicensesAdminController {
  constructor(private readonly offlineLicenses: OfflineLicensesService) {}

  @Get()
  findAll(@Query('status') status?: string) {
    return this.offlineLicenses.findAll(status);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Req() req: Request) {
    return this.offlineLicenses.approve(id, req.platformAdmin?.id ?? null);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Req() req: Request) {
    return this.offlineLicenses.reject(id, req.platformAdmin?.id ?? null);
  }
}
