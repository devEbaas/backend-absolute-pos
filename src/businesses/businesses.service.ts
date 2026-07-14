import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusinessDto } from './dto/create-business.dto';

@Injectable()
export class BusinessesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateBusinessDto) {
    return this.prisma.business.create({ data: { name: dto.name } });
  }

  findAll() {
    return this.prisma.business.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
