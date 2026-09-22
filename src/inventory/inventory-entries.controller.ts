import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { MobileAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateInventoryEntryDto } from './dto/create-inventory-entry.dto';
import { InventoryEntriesService } from './inventory-entries.service';

// specs/22 §5 — entrada de productos por lote, atómica e idempotente (B2). Es la única forma de registrar una entrada:
// ya no existe `POST /inventory-movements` (un movimiento por llamada, no atómico; solo lo usaba la app React Native).
@ApiTags('inventory')
@ApiBearerAuth('bearer')
@UseGuards(MobileAuthGuard)
@Controller('inventory-entries')
export class InventoryEntriesController {
  constructor(private readonly entries: InventoryEntriesService) {}

  @Post()
  create(@Req() req: Request, @Body() dto: CreateInventoryEntryDto) {
    return this.entries.create(req.auth!, dto);
  }
}
