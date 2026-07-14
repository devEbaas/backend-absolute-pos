import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { DeviceAuthGuard } from '../common/guards/device-auth.guard';
import { ProductsService } from './products.service';

// Read-only for now — write path is exclusively through /sync/push
// (see ProductsService.upsertFromSync). A direct POST/PUT here is
// deferred until an actual consumer needs it (dashboard/mobile), so we
// don't maintain a second, untested write path for no reason.
@ApiTags('products')
@ApiBearerAuth('bearer')
@UseGuards(DeviceAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  findAll(@Req() req: Request) {
    return this.products.findMany(req.device!.businessId);
  }
}
