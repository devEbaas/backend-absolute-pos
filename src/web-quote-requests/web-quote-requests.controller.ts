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
import { WebQuoteRequestsService } from './web-quote-requests.service';
import { CreateWebQuoteRequestDto } from './dto/create-web-quote-request.dto';

// Llamado sin autenticación desde el formulario de dudas/cambios sugeridos
// de una cotización en absolute-systems-web (ver src/lib/api.ts allá) —
// cualquier visitante con el link puede escribir, no hay identidad que
// verificar todavía. La confirmación real del proyecto casi siempre llega
// por WhatsApp o en persona — ver WebQuoteRequestsService.markConfirmed.
// Requiere que el origen del sitio esté en MARKETING_ORIGINS (ver main.ts)
// para pasar CORS — mismo origen que ya usa /demo-requests.
@ApiTags('web-quote-requests')
@Controller('web-quote-requests')
export class WebQuoteRequestsPublicController {
  constructor(private readonly webQuoteRequests: WebQuoteRequestsService) {}

  @Post()
  create(@Body() dto: CreateWebQuoteRequestDto) {
    return this.webQuoteRequests.create(dto);
  }
}

// Bandeja para admin-pos-dashboard — mismo guard que
// DemoRequestsAdminController (master key o JWT de platform-admin).
@ApiTags('admin/web-quote-requests')
@ApiBearerAuth('bearer')
@UseGuards(AdminAccessGuard)
@Controller('admin/web-quote-requests')
export class WebQuoteRequestsAdminController {
  constructor(private readonly webQuoteRequests: WebQuoteRequestsService) {}

  @Get()
  findAll(@Query('contacted') contacted?: string) {
    return this.webQuoteRequests.findAll(contacted);
  }

  @Post(':id/contacted')
  markContacted(@Param('id') id: string) {
    return this.webQuoteRequests.markContacted(id);
  }

  @Post(':id/confirmed')
  markConfirmed(@Param('id') id: string) {
    return this.webQuoteRequests.markConfirmed(id);
  }
}
