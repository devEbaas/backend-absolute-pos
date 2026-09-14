import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWebQuoteRequestDto } from './dto/create-web-quote-request.dto';

@Injectable()
export class WebQuoteRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateWebQuoteRequestDto) {
    return this.prisma.webQuoteRequest.create({ data: dto });
  }

  findAll(contacted?: string) {
    return this.prisma.webQuoteRequest.findMany({
      where:
        contacted === undefined
          ? undefined
          : { contacted: contacted === 'true' },
      orderBy: { createdAt: 'desc' },
    });
  }

  // updateMany + count como guarda atómica contra doble click, mismo patrón
  // que DemoRequestsService.markContacted.
  async markContacted(id: string) {
    const claim = await this.prisma.webQuoteRequest.updateMany({
      where: { id, contacted: false },
      data: { contacted: true, contactedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new NotFoundException(
        'Solicitud de cotización no encontrada o ya marcada como contactada',
      );
    }
    return this.prisma.webQuoteRequest.findUniqueOrThrow({ where: { id } });
  }
}
