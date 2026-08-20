import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { CancelQuoteDto } from './dto/cancel-quote.dto';
import { SetQuoteHiddenDto } from './dto/set-quote-hidden.dto';
import { QuotesQueryDto } from './dto/quotes-query.dto';

// A diferencia de Ventas (100% solo-lectura en el dashboard vía
// ReportsController), el dueño SÍ puede crear/editar/cancelar cotizaciones
// desde acá — decisión de producto tomada: "convertir a venta" queda
// exclusivo de la caja física (ver documentation/COTIZACIONES.md sección 3
// en absolute-pos-app), así que este controller no expone ningún endpoint
// de conversión a venta.
@ApiTags('quotes')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get()
  findAll(@Req() req: Request, @Query() query: QuotesQueryDto) {
    return this.quotes.findAllForBusiness(req.auth!.businessId, {
      status: query.status,
      includeHidden: query.includeHidden!,
      search: query.search,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page!,
      limit: query.limit!,
    });
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    return this.quotes.findOneForBusiness(req.auth!.businessId, id);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateQuoteDto) {
    const { businessId, deviceId, userId } = req.auth!;
    return this.quotes.create(businessId, deviceId ?? null, userId, dto);
  }

  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateQuoteDto,
  ) {
    return this.quotes.update(req.auth!.businessId, id, dto);
  }

  @Post(':id/cancel')
  cancel(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CancelQuoteDto,
  ) {
    return this.quotes.cancel(
      req.auth!.businessId,
      req.auth!.userId,
      id,
      dto.reason,
    );
  }

  @Post(':id/hide')
  setHidden(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: SetQuoteHiddenDto,
  ) {
    return this.quotes.setHidden(req.auth!.businessId, id, dto.hidden);
  }
}
