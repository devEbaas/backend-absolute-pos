import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { MobileAuthGuard } from '../common/guards/jwt-auth.guard';
import { MovementsQueryDto } from './dto/movements-query.dto';
import { PrismaService } from '../prisma/prisma.service';

// Historial de movimientos de inventario para la app móvil (specs/22 §3.5). Las entradas se registran con
// `POST /inventory-entries` (lote atómico); ya no existe el `POST /inventory-movements` de un movimiento por llamada,
// que solo usaba la app React Native.
@ApiTags('inventory')
@ApiBearerAuth('bearer')
@UseGuards(MobileAuthGuard)
@Controller('inventory-movements')
export class InventoryController {
  constructor(private readonly prisma: PrismaService) {}

  // specs/22 §3.5 — historial de movimientos del NEGOCIO completo (el único listado móvil no acotado a lo propio: sus
  // fechas pueden venir del escritorio con el desfase de R2, README decisión 7). `productName`/`productBarcode` son los
  // del producto de inventario (el padre si la línea fue una presentación), como en el desktop.
  @Get()
  async list(@Req() req: Request, @Query() query: MovementsQueryDto) {
    const rows = await this.prisma.inventoryMovement.findMany({
      where: {
        businessId: req.auth!.businessId,
        ...(query.type ? { type: query.type } : {}),
        ...(query.reference ? { reference: query.reference } : {}),
        ...(query.productId ? { productId: query.productId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 100,
      include: {
        product: { select: { name: true, barcode: true } },
        user: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      productName: row.product.name,
      productBarcode: row.product.barcode,
      userId: row.userId,
      userName: row.user?.name ?? null,
      type: row.type,
      reference: row.reference,
      referenceId: row.referenceId,
      quantity: Number(row.quantity),
      linkedProductName: row.linkedProductName,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
