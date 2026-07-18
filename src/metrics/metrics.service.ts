import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [
      totalClients,
      totalUsers,
      totalActiveLicenses,
      totalCodesGenerated,
      byPlatform,
    ] = await Promise.all([
      this.prisma.business.count(),
      this.prisma.user.count(),
      this.prisma.device.count({ where: { revokedAt: null } }),
      this.prisma.pairingCode.count(),
      // Desglose por tipo de dispositivo — todas las licencias, no solo las
      // activas, para el gráfico de barras del dashboard.
      this.prisma.device.groupBy({ by: ['platform'], _count: { _all: true } }),
    ]);

    const countFor = (platform: string) =>
      byPlatform.find((row) => row.platform === platform)?._count._all ?? 0;

    return {
      totalClients,
      totalUsers,
      totalActiveLicenses,
      totalCodesGenerated,
      desktopLicenseCount: countFor('desktop'),
      mobileLicenseCount: countFor('mobile'),
    };
  }
}
