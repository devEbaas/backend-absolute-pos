import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MasterKeyGuard } from '../common/guards/master-key.guard';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import { PlatformAdminsService } from './platform-admins.service';
import { CreatePlatformAdminDto } from './dto/create-platform-admin.dto';
import { PlatformAdminLoginDto } from './dto/platform-admin-login.dto';

// Bootstrap del primer platform admin — master-key gated, como
// UsersAdminController. El operador lo llama una sola vez desde la
// terminal (ver DEPLOY.md); pos-root-dashboard nunca ve el MASTER_API_KEY.
@ApiTags('admin/platform-admins')
@ApiBearerAuth('bearer')
@UseGuards(MasterKeyGuard)
@Controller('admin/platform-admins')
export class PlatformAdminsBootstrapController {
  constructor(private readonly platformAdmins: PlatformAdminsService) {}

  @Post()
  create(@Body() dto: CreatePlatformAdminDto) {
    return this.platformAdmins.create(dto);
  }
}

// Self-service una vez logueado: agregar colegas u obtener la lista de
// operadores actuales, sin volver a necesitar la master key.
@ApiTags('platform-admins')
@ApiBearerAuth('bearer')
@UseGuards(PlatformAdminGuard)
@Controller('platform-admins')
export class PlatformAdminsController {
  constructor(private readonly platformAdmins: PlatformAdminsService) {}

  @Post()
  create(@Body() dto: CreatePlatformAdminDto) {
    return this.platformAdmins.create(dto);
  }

  @Get()
  findAll() {
    return this.platformAdmins.findAll();
  }
}

// Público — username+password son la autenticación, igual que /auth/login
// pero sin DeviceAuthGuard previo (no hay dispositivo involucrado, un
// platform admin no pertenece a ningún negocio).
@ApiTags('platform-admins')
@Controller('platform-admin')
export class PlatformAuthController {
  constructor(private readonly platformAdmins: PlatformAdminsService) {}

  @Post('login')
  login(@Body() dto: PlatformAdminLoginDto) {
    return this.platformAdmins.login(dto.username, dto.password);
  }
}
