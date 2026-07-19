import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { ReportsService } from './reports.service';
import { DateRangeDto } from './dto/date-range.dto';
import { SalesQueryDto } from './dto/sales-query.dto';
import { TopProductsQueryDto } from './dto/top-products-query.dto';
import { CashCutsQueryDto } from './dto/cash-cuts-query.dto';
import { CashSessionsQueryDto } from './dto/cash-sessions-query.dto';
import { CashOutflowsQueryDto } from './dto/cash-outflows-query.dto';
import { InventoryMovementsQueryDto } from './dto/inventory-movements-query.dto';
import { ProductsQueryDto } from './dto/products-query.dto';

// Todo lo que el dueño de un negocio necesita solo-lectura para su dashboard
// (resumen, ventas, cortes de caja, inventario, usuarios). Centralizado acá
// en vez de esparcido en sales/cash/inventory/products/users controllers
// para no tocar las rutas mobile-facing existentes (device-gated) y para
// aplicar un único guard combo — ver docs/dashboard-cliente-design-brief.md.
@ApiTags('reports')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('overview')
  overview(@Req() req: Request, @Query() query: DateRangeDto) {
    return this.reports.overview(req.auth!.businessId, query.from, query.to);
  }

  @Get('sales-by-day')
  salesByDay(@Req() req: Request, @Query() query: DateRangeDto) {
    return this.reports.salesByDay(req.auth!.businessId, query.from, query.to);
  }

  @Get('sales-by-payment-method')
  salesByPaymentMethod(@Req() req: Request, @Query() query: DateRangeDto) {
    return this.reports.salesByPaymentMethod(
      req.auth!.businessId,
      query.from,
      query.to,
    );
  }

  @Get('top-products')
  topProducts(@Req() req: Request, @Query() query: TopProductsQueryDto) {
    return this.reports.topProducts(
      req.auth!.businessId,
      query.from,
      query.to,
      query.limit,
    );
  }

  @Get('sales')
  listSales(@Req() req: Request, @Query() query: SalesQueryDto) {
    return this.reports.listSales(req.auth!.businessId, {
      from: query.from,
      to: query.to,
      deviceId: query.deviceId,
      userId: query.userId,
      page: query.page!,
      limit: query.limit!,
    });
  }

  @Get('cash-sessions')
  cashSessions(@Req() req: Request, @Query() query: CashSessionsQueryDto) {
    return this.reports.cashSessions(req.auth!.businessId, {
      status: query.status,
      from: query.from,
      to: query.to,
    });
  }

  @Get('cash-cuts')
  cashCuts(@Req() req: Request, @Query() query: CashCutsQueryDto) {
    return this.reports.cashCuts(req.auth!.businessId, {
      sessionId: query.sessionId,
      from: query.from,
      to: query.to,
    });
  }

  @Get('cash-outflows')
  cashOutflows(@Req() req: Request, @Query() query: CashOutflowsQueryDto) {
    return this.reports.cashOutflows(req.auth!.businessId, query.sessionId);
  }

  @Get('inventory-movements')
  inventoryMovements(
    @Req() req: Request,
    @Query() query: InventoryMovementsQueryDto,
  ) {
    return this.reports.inventoryMovements(req.auth!.businessId, {
      productId: query.productId,
      from: query.from,
      to: query.to,
    });
  }

  @Get('products')
  products(@Req() req: Request, @Query() query: ProductsQueryDto) {
    return this.reports.products(req.auth!.businessId, query.includeStock!);
  }

  @Get('users')
  users(@Req() req: Request) {
    return this.reports.users(req.auth!.businessId);
  }
}
