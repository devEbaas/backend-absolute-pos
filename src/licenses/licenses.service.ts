import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LicensesService {
  constructor(private readonly prisma: PrismaService) {}

  // Llamado por el desktop ya emparejado (DeviceAuthGuard). Idempotente: una
  // licencia pending/active existente se devuelve tal cual, sin duplicar
  // filas por clicks repetidos. Una licencia revocada puede volver a
  // solicitarse (reinicia a pending) — el resto de estados no cambian.
  async request(deviceId: string) {
    const existing = await this.prisma.license.findUnique({
      where: { deviceId },
    });

    if (!existing) {
      return this.prisma.license.create({ data: { deviceId } });
    }

    if (existing.status === 'revoked') {
      return this.prisma.license.update({
        where: { deviceId },
        data: {
          status: 'pending',
          requestedAt: new Date(),
          activatedAt: null,
          activatedBy: null,
        },
      });
    }

    return existing;
  }

  async getStatus(deviceId: string) {
    const license = await this.prisma.license.findUnique({
      where: { deviceId },
    });
    return license ?? { status: 'none' };
  }

  findAll(status?: string) {
    return this.prisma.license.findMany({
      where: status ? { status } : undefined,
      orderBy: { requestedAt: 'desc' },
      include: {
        device: {
          select: {
            id: true,
            label: true,
            platform: true,
            business: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
  }

  // updateMany + count como guarda atómica contra doble aprobación
  // concurrente (mismo patrón que DevicesService.pair con pairing_codes).
  async approve(id: string, adminId: string | null) {
    const claim = await this.prisma.license.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'active', activatedAt: new Date(), activatedBy: adminId },
    });
    if (claim.count === 0) {
      throw new NotFoundException(
        'Solicitud de licencia no encontrada o ya procesada',
      );
    }
    return this.prisma.license.findUniqueOrThrow({ where: { id } });
  }

  async revoke(id: string) {
    const license = await this.prisma.license.findUnique({ where: { id } });
    if (!license) {
      throw new NotFoundException('Licencia no encontrada');
    }
    return this.prisma.license.update({
      where: { id },
      data: { status: 'revoked' },
    });
  }
}
