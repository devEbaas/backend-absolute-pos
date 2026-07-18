import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateBusinessDto } from './dto/create-business.dto';

@Injectable()
export class BusinessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  // No es una única transacción de DB con la creación del usuario (ver
  // UsersService.create, que ya maneja la suya) — si la creación del owner
  // fallara justo después de crear el negocio (prácticamente imposible: el
  // único choque posible es username duplicado, y el negocio es nuevo), el
  // negocio queda sin admin pero se puede agregar uno después vía "Agregar
  // usuario". Se prefiere reusar la lógica ya probada de UsersService
  // (password hashing, sync_log) antes que duplicarla dentro de una
  // transacción compartida.
  async create(dto: CreateBusinessDto) {
    const business = await this.prisma.business.create({
      data: { name: dto.name, slug: dto.slug },
    });

    const owner = await this.users.create(business.id, {
      name: dto.ownerName,
      username: dto.ownerEmail,
      email: dto.ownerEmail,
      phone: dto.ownerPhone,
      role: 'admin',
    });

    return { business, owner };
  }

  findAll() {
    return this.prisma.business
      .findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              users: true,
              devices: { where: { revokedAt: null } },
            },
          },
        },
      })
      .then((businesses) =>
        businesses.map(({ _count, ...business }) => ({
          ...business,
          userCount: _count.users,
          activeLicenseCount: _count.devices,
        })),
      );
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
