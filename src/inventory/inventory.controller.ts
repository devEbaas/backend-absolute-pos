import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { InventoryMovementsResource } from '../sync/resources/inventory-movements.resource';
import { InventoryMovementSyncItemDto } from '../sync/dto/inventory-movement-sync-item.dto';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';

// Manual stock entries ("entradas") from the mobile app. Reuses
// InventoryMovementsResource.upsertFromSync — the same write path
// /sync/push uses — so stock derived as SUM(inventory_movements) never
// has to reconcile two code paths.
@ApiTags('inventory')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('inventory-movements')
export class InventoryController {
  constructor(
    private readonly inventoryMovements: InventoryMovementsResource,
  ) {}

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateInventoryMovementDto) {
    const { businessId, deviceId, userId } = req.auth!;
    const syncDto: InventoryMovementSyncItemDto = {
      uuid: randomUUID(),
      productUuid: dto.productId,
      type: dto.type ?? 'IN',
      quantity: dto.quantity,
      reference: dto.reference ?? 'PRODUCT_ENTRY',
      referenceUuid: null,
      linkedProductName: dto.linkedProductName ?? null,
      userUuid: userId,
      createdAt: new Date().toISOString(),
    };
    await this.inventoryMovements.upsertFromSync(businessId, deviceId, syncDto);
    return syncDto;
  }
}
