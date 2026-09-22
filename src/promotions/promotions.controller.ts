import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { MobileAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

// specs/22 §3.3 — las promociones activas para el cajero. Hoy solo las lee un admin (`/reports/promotions`); el motor de
// promociones de la app móvil las necesita para calcular el descuento al armar el ticket.
@ApiTags('promotions')
@ApiBearerAuth('bearer')
@UseGuards(MobileAuthGuard)
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('active')
  async active(@Req() req: Request) {
    const rows = await this.prisma.promotion.findMany({
      where: { businessId: req.auth!.businessId, active: true },
      include: { products: { select: { productId: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      requiredQuantity: row.requiredQuantity,
      discountType: row.discountType,
      discountValue: Number(row.discountValue),
      freeQuantity: row.freeQuantity,
      productIds: row.products.map((p) => p.productId),
    }));
  }
}
