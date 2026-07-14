import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { generateApiKey, hashApiKey } from '../common/crypto.util';
import { CreateDeviceDto } from './dto/create-device.dto';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(businessId: string, dto: CreateDeviceDto) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) {
      throw new NotFoundException('Negocio no encontrado');
    }

    const apiKey = generateApiKey();
    const device = await this.prisma.device.create({
      data: { businessId, label: dto.label, apiKeyHash: hashApiKey(apiKey) },
    });

    // The plaintext key is returned exactly once — only its hash is
    // persisted. Paste it into the Electron install's cloud_device_api_key
    // setting; there is no way to retrieve it again after this response.
    return {
      id: device.id,
      businessId: device.businessId,
      label: device.label,
      apiKey,
    };
  }

  findAllForBusiness(businessId: string) {
    return this.prisma.device.findMany({
      where: { businessId },
      select: {
        id: true,
        businessId: true,
        label: true,
        lastSeenAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
