import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusinessDto } from './dto/create-business.dto';

@Injectable()
export class BusinessesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateBusinessDto) {
    return this.prisma.business.create({
      data: { name: dto.name, slug: dto.slug },
    });
  }

  findAll() {
    return this.prisma.business.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const business = await this.prisma.business.findUnique({ where: { id } });
    if (!business) {
      throw new NotFoundException('Negocio no encontrado');
    }
    return business;
  }

  findBySlug(slug: string) {
    return this.prisma.business.findUnique({ where: { slug } });
  }
}
