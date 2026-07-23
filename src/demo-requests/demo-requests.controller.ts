import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAccessGuard } from '../common/guards/admin-access.guard';
import { DemoRequestsService } from './demo-requests.service';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';

// Llamado sin autenticación desde el formulario público de
// absolute-systems-web (ver src/lib/api.ts allá) — cualquier visitante puede
// pedir una demo, no hay identidad que verificar todavía. Requiere que el
// origen del sitio esté en MARKETING_ORIGINS (ver main.ts) para pasar CORS.
@ApiTags('demo-requests')
@Controller('demo-requests')
export class DemoRequestsPublicController {
  constructor(private readonly demoRequests: DemoRequestsService) {}

  @Post()
  create(@Body() dto: CreateDemoRequestDto) {
    return this.demoRequests.create(dto);
  }
}

// Bandeja para pos-root-dashboard — mismo guard que
// LicensesAdminController/BusinessesController (master key o JWT de
// platform-admin).
@ApiTags('admin/demo-requests')
@ApiBearerAuth('bearer')
@UseGuards(AdminAccessGuard)
@Controller('admin/demo-requests')
export class DemoRequestsAdminController {
  constructor(private readonly demoRequests: DemoRequestsService) {}

  @Get()
  findAll(@Query('contacted') contacted?: string) {
    return this.demoRequests.findAll(contacted);
  }

  @Post(':id/contacted')
  markContacted(@Param('id') id: string) {
    return this.demoRequests.markContacted(id);
  }
}
