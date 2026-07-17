import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminAccessGuard } from '../common/guards/admin-access.guard';
import { DeviceAuthGuard } from '../common/guards/device-auth.guard';
import { DevicesService } from './devices.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { PairDeviceDto } from './dto/pair-device.dto';
import { CreatePairingCodeDto } from './dto/create-pairing-code.dto';

@ApiTags('admin/devices')
@ApiBearerAuth('bearer')
@UseGuards(AdminAccessGuard)
@Controller('admin/businesses/:businessId/devices')
export class DevicesAdminController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  create(
    @Param('businessId') businessId: string,
    @Body() dto: CreateDeviceDto,
  ) {
    return this.devices.create(businessId, dto);
  }

  @Get()
  findAll(@Param('businessId') businessId: string) {
    return this.devices.findAllForBusiness(businessId);
  }

  // Genera el código que el root_admin de la nueva caja (o el usuario del
  // celular) va a capturar/escanear, junto al slug del negocio — alternativa
  // al apiKey en texto plano de arriba, pensada para dar de alta
  // dispositivos desde pos-root-dashboard sin repetir la master key.
  @Post('pairing-codes')
  createPairingCode(
    @Param('businessId') businessId: string,
    @Body() dto: CreatePairingCodeDto,
  ) {
    return this.devices.createPairingCode(businessId, dto);
  }

  // Historial de códigos generados para este negocio (activos, usados y
  // expirados) — para que el dashboard los liste, no solo el que se acaba
  // de crear.
  @Get('pairing-codes')
  findPairingCodes(@Param('businessId') businessId: string) {
    return this.devices.findPairingCodes(businessId);
  }

  // Invalida el device sin borrar su historial de ventas — DeviceAuthGuard
  // rechaza cualquier request suyo desde este momento (ver revokedAt en
  // devices.service.ts y el chequeo agregado ahí).
  @Post(':deviceId/revoke')
  revoke(
    @Param('businessId') businessId: string,
    @Param('deviceId') deviceId: string,
  ) {
    return this.devices.revoke(businessId, deviceId);
  }
}

// Self-service "whoami" for a device — proves the device API key works and
// gives the sync worker a cheap connectivity/identity check independent of
// the sync endpoints themselves.
@ApiTags('devices')
@ApiBearerAuth('bearer')
@UseGuards(DeviceAuthGuard)
@Controller('devices')
export class DevicesSelfController {
  @Get('me')
  me(@Req() req: Request) {
    return { success: true, device: req.device };
  }
}

// Público — sin guard, el código de un solo uso es la autenticación. El
// root_admin del wizard de primer arranque (absolute-pos-app) llama esto
// una sola vez por caja para obtener su propio device api key.
@ApiTags('devices')
@Controller('devices')
export class DevicesPairingController {
  constructor(private readonly devices: DevicesService) {}

  @Post('pair')
  pair(@Body() dto: PairDeviceDto) {
    return this.devices.pair(dto);
  }
}
