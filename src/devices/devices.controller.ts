import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { MasterKeyGuard } from '../common/guards/master-key.guard';
import { DeviceAuthGuard } from '../common/guards/device-auth.guard';
import { DevicesService } from './devices.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { PairDeviceDto } from './dto/pair-device.dto';

@ApiTags('admin/devices')
@ApiBearerAuth('bearer')
@UseGuards(MasterKeyGuard)
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

  // Genera el código que el root_admin de la nueva caja va a capturar en el
  // wizard, junto al slug del negocio — alternativa al apiKey en texto plano
  // de arriba, pensada para dar de alta cajas sin que el operador tenga que
  // correr un curl con la master key por cada instalación.
  @Post('pairing-codes')
  createPairingCode(@Param('businessId') businessId: string) {
    return this.devices.createPairingCode(businessId);
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
