import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOfflineLicenseRequestDto } from './dto/create-offline-license-request.dto';
import { generateOfflineLicenseKey } from '../common/license-signing.util';

@Injectable()
export class OfflineLicensesService {
  constructor(private readonly prisma: PrismaService) {}

  // Llamado sin auth desde el botón "Solicitar Licencia" de absolute-pos-app
  // (ver LicenseView.jsx) — el hardwareId es la única identidad, no hace
  // falta emparejar la instalación primero. Idempotente: una solicitud
  // pending/approved existente se devuelve tal cual; una rejected puede
  // volver a pedirse (reinicia a pending), mismo patrón que LicensesService.
  async request(dto: CreateOfflineLicenseRequestDto) {
    const hardwareId = dto.hardwareId.toUpperCase();
    const existing = await this.prisma.offlineLicenseRequest.findUnique({
      where: { hardwareId },
    });

    if (!existing) {
      return this.prisma.offlineLicenseRequest.create({
        data: {
          hardwareId,
          contactName: dto.contactName,
          businessName: dto.businessName,
        },
      });
    }

    if (existing.status === 'rejected') {
      return this.prisma.offlineLicenseRequest.update({
        where: { hardwareId },
        data: {
          status: 'pending',
          contactName: dto.contactName ?? existing.contactName,
          businessName: dto.businessName ?? existing.businessName,
          requestedAt: new Date(),
          resolvedAt: null,
          resolvedBy: null,
          licenseKey: null,
        },
      });
    }

    return existing;
  }

  // Público — respuesta mínima a propósito (solo lo que la app necesita
  // para activarse), no expone contactName/businessName/id.
  async getStatus(hardwareId: string) {
    const request = await this.prisma.offlineLicenseRequest.findUnique({
      where: { hardwareId: hardwareId.toUpperCase() },
    });
    if (!request) {
      return { status: 'none', licenseKey: null };
    }
    return { status: request.status, licenseKey: request.licenseKey };
  }

  findAll(status?: string) {
    return this.prisma.offlineLicenseRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { requestedAt: 'desc' },
    });
  }

  // updateMany + count como guarda atómica contra doble aprobación
  // concurrente, mismo patrón que LicensesService.approve.
  async approve(id: string, adminId: string | null) {
    const request = await this.prisma.offlineLicenseRequest.findUnique({
      where: { id },
    });
    if (!request) {
      throw new NotFoundException(
        'Solicitud de licencia offline no encontrada',
      );
    }

    const licenseKey = generateOfflineLicenseKey(request.hardwareId);

    const claim = await this.prisma.offlineLicenseRequest.updateMany({
      where: { id, status: 'pending' },
      data: {
        status: 'approved',
        licenseKey,
        resolvedAt: new Date(),
        resolvedBy: adminId,
      },
    });
    if (claim.count === 0) {
      throw new NotFoundException(
        'Solicitud de licencia offline no encontrada o ya procesada',
      );
    }
    return this.prisma.offlineLicenseRequest.findUniqueOrThrow({
      where: { id },
    });
  }

  async reject(id: string, adminId: string | null) {
    const claim = await this.prisma.offlineLicenseRequest.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'rejected', resolvedAt: new Date(), resolvedBy: adminId },
    });
    if (claim.count === 0) {
      throw new NotFoundException(
        'Solicitud de licencia offline no encontrada o ya procesada',
      );
    }
    return this.prisma.offlineLicenseRequest.findUniqueOrThrow({
      where: { id },
    });
  }
}
