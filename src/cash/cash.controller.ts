import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { MobileAuthGuard } from '../common/guards/jwt-auth.guard';
import { CashService } from './cash.service';
import { OpenCashSessionDto } from './dto/open-cash-session.dto';
import { CreateCashOutflowDto } from './dto/create-cash-outflow.dto';
import { CutsPageQueryDto } from './dto/cuts-page-query.dto';
import { CloseWithCutDto } from './dto/close-with-cut.dto';

@ApiTags('cash')
@ApiBearerAuth('bearer')
@UseGuards(MobileAuthGuard)
@Controller()
export class CashController {
  constructor(private readonly cash: CashService) {}

  // — Lecturas para el cajero (specs/22 §3.4), todas propias: del usuario y dispositivo del token —

  @Get('cash-sessions/current')
  currentSession(@Req() req: Request) {
    return this.cash.currentSession(req.auth!);
  }

  @Get('cash-sessions/:id/summary')
  summary(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.cash.summary(req.auth!, id);
  }

  @Get('cash-sessions/:id/outflows')
  outflows(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.cash.outflows(req.auth!, id);
  }

  @Get('cash-sessions/:id/sales')
  sales(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.cash.sales(req.auth!, id);
  }

  @Get('cash-cuts')
  cuts(@Req() req: Request, @Query() query: CutsPageQueryDto) {
    return this.cash.cutsPage(req.auth!, query.page, query.pageSize);
  }

  @Post('cash-sessions')
  openSession(@Req() req: Request, @Body() dto: OpenCashSessionDto) {
    return this.cash.openSession(req.auth!, dto);
  }

  // specs/22 §4.3 — el corte y el cierre en una sola transacción. Es la ÚNICA forma de cerrar una caja: no existen las
  // llamadas sueltas `POST /cash-cuts` y `PATCH …/close` (no eran atómicas y solo las usaba la app React Native).
  @Post('cash-sessions/:id/close-with-cut')
  closeWithCut(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseWithCutDto,
  ) {
    return this.cash.closeWithCut(req.auth!, id, dto);
  }

  @Post('cash-outflows')
  createOutflow(@Req() req: Request, @Body() dto: CreateCashOutflowDto) {
    return this.cash.createOutflow(req.auth!, dto);
  }
}
