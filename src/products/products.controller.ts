import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard, MobileAuthGuard } from '../common/guards/jwt-auth.guard';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';

@ApiTags('products')
@ApiBearerAuth('bearer')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  // specs/22 §3.2 — catálogo móvil con existencias (JWT, cualquier rol).
  @UseGuards(MobileAuthGuard)
  @Get('with-stock')
  findAllWithStock(@Req() req: Request) {
    return this.products.findManyWithStock(req.auth!.businessId);
  }

  // specs/22 §6.1 (B5) — alta con `id` (idempotente) e `initialStock`; responde con la forma de §3.2. Sigue con
  // `JwtAuthGuard` y no `MobileAuthGuard`: el dashboard del dueño (token sin `deviceId`) también crea productos aquí, y
  // las reglas extra de la app (`id` obligatorio, precio y costo) se aplican solo a los tokens de dispositivo.
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: Request, @Body() dto: CreateProductDto) {
    return this.products.create(req.auth!, dto);
  }

  // Edición y ajuste de stock por valor absoluto (`stock`). La baja lógica es `{ "active": false }`.
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(req.auth!, id, dto);
  }
}
