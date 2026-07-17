import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { DeviceAuthGuard } from '../common/guards/device-auth.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { ProductSyncItemDto } from '../sync/dto/product-sync-item.dto';

@ApiTags('products')
@ApiBearerAuth('bearer')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @UseGuards(DeviceAuthGuard)
  @Get()
  findAll(@Req() req: Request) {
    return this.products.findMany(req.device!.businessId);
  }

  // Reuses the same write path as /sync/push (ProductsService.upsertFromSync
  // — see its own comment) so a mobile-created product and a
  // desktop-synced one can never drift apart.
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Req() req: Request, @Body() dto: CreateProductDto) {
    const { businessId, deviceId } = req.auth!;
    const now = new Date().toISOString();
    const syncDto: ProductSyncItemDto = {
      uuid: randomUUID(),
      barcode: dto.barcode ?? null,
      name: dto.name,
      description: dto.description ?? null,
      salePrice: dto.salePrice,
      purchaseCost: dto.purchaseCost,
      tipoVenta: dto.tipoVenta ?? 'UNIDAD',
      imagePath: dto.imagePath ?? null,
      active: dto.active ?? true,
      parentProductUuid: dto.parentProductId ?? null,
      unitsPerPack: dto.unitsPerPack ?? 1,
      location: dto.location ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await this.products.upsertFromSync(businessId, deviceId, syncDto);
    return this.products.findOne(businessId, syncDto.uuid);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const { businessId, deviceId } = req.auth!;
    const existing = await this.products.findOne(businessId, id);
    if (!existing) {
      throw new NotFoundException('Producto no encontrado');
    }

    const syncDto: ProductSyncItemDto = {
      uuid: id,
      barcode: dto.barcode ?? existing.barcode,
      name: dto.name ?? existing.name,
      description: dto.description ?? existing.description,
      salePrice: dto.salePrice ?? Number(existing.salePrice),
      purchaseCost: dto.purchaseCost ?? Number(existing.purchaseCost),
      tipoVenta: dto.tipoVenta ?? existing.tipoVenta,
      imagePath: dto.imagePath ?? existing.imagePath,
      active: dto.active ?? existing.active,
      parentProductUuid:
        dto.parentProductId ?? existing.parentProductId ?? null,
      unitsPerPack: dto.unitsPerPack ?? Number(existing.unitsPerPack),
      location: dto.location ?? existing.location,
      createdAt: existing.createdAt.toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.products.upsertFromSync(businessId, deviceId, syncDto);
    return this.products.findOne(businessId, id);
  }
}
