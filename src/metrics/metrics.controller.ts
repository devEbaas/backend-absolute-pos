import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAccessGuard } from '../common/guards/admin-access.guard';
import { MetricsService } from './metrics.service';

// Panorama global de la red (todos los negocios) para la sección
// "Métricas" de pos-root-dashboard — mismo gate que el resto de /admin/*.
@ApiTags('admin/metrics')
@ApiBearerAuth('bearer')
@UseGuards(AdminAccessGuard)
@Controller('admin/metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  getOverview() {
    return this.metrics.getOverview();
  }
}
