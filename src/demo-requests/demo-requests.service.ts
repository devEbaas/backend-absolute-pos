import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';

@Injectable()
export class DemoRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateDemoRequestDto) {
    return this.prisma.demoRequest.create({ data: dto });
  }

  findAll(contacted?: string) {
    return this.prisma.demoRequest.findMany({
      where:
        contacted === undefined
          ? undefined
          : { contacted: contacted === 'true' },
      orderBy: { createdAt: 'desc' },
    });
  }

  // updateMany + count como guarda atómica contra doble click, mismo patrón
  // que LicensesService.approve.
  async markContacted(id: string) {
    const claim = await this.prisma.demoRequest.updateMany({
      where: { id, contacted: false },
      data: { contacted: true, contactedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new NotFoundException(
        'Solicitud de demo no encontrada o ya marcada como contactada',
      );
    }
    return this.prisma.demoRequest.findUniqueOrThrow({ where: { id } });
  }
}
