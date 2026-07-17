import { Body, Controller, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CashService } from './cash.service';
import { OpenCashSessionDto } from './dto/open-cash-session.dto';
import { CreateCashOutflowDto } from './dto/create-cash-outflow.dto';
import { CreateCashCutDto } from './dto/create-cash-cut.dto';

@ApiTags('cash')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller()
export class CashController {
  constructor(private readonly cash: CashService) {}

  @Post('cash-sessions')
  openSession(@Req() req: Request, @Body() dto: OpenCashSessionDto) {
    const { businessId, deviceId, userId } = req.auth!;
    return this.cash.openSession(businessId, deviceId, userId, dto);
  }

  @Patch('cash-sessions/:id/close')
  closeSession(@Req() req: Request, @Param('id') id: string) {
    const { businessId, deviceId } = req.auth!;
    return this.cash.closeSession(businessId, deviceId, id);
  }

  @Post('cash-outflows')
  createOutflow(@Req() req: Request, @Body() dto: CreateCashOutflowDto) {
    const { businessId, deviceId, userId } = req.auth!;
    return this.cash.createOutflow(businessId, deviceId, userId, dto);
  }

  @Post('cash-cuts')
  createCut(@Req() req: Request, @Body() dto: CreateCashCutDto) {
    const { businessId, deviceId, userId } = req.auth!;
    return this.cash.createCut(businessId, deviceId, userId, dto);
  }
}
