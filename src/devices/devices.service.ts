import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  generateApiKey,
  generatePairingCode,
  hashApiKey,
} from '../common/crypto.util';
import { CreateDeviceDto } from './dto/create-device.dto';
import { PairDeviceDto } from './dto/pair-device.dto';

const PAIRING_CODE_TTL_MS = 30 * 60 * 1000;

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

  // Generado por el operador (MASTER_API_KEY) cuando da de alta un negocio o
  // agrega una caja — el código y el slug son lo único que el root_admin de
  // esa caja necesita capturar en el wizard de primer arranque.
  async createPairingCode(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) {
      throw new NotFoundException('Negocio no encontrado');
    }

    const pairingCode = await this.prisma.pairingCode.create({
      data: {
        businessId,
        code: generatePairingCode(),
        expiresAt: new Date(Date.now() + PAIRING_CODE_TTL_MS),
      },
    });

    return { code: pairingCode.code, expiresAt: pairingCode.expiresAt };
  }

  // Endpoint público (sin guard) — el código de un solo uso ES la
  // autenticación aquí, no un device api key todavía (el dispositivo no
  // tiene uno hasta que este método termina).
  async pair(dto: PairDeviceDto) {
    const business = await this.prisma.business.findUnique({
      where: { slug: dto.slug },
    });
    if (!business) {
      throw new NotFoundException('Negocio no encontrado');
    }

    const pairingCode = await this.prisma.pairingCode.findUnique({
      where: { code: dto.pairingCode },
    });
    if (
      !pairingCode ||
      pairingCode.businessId !== business.id ||
      pairingCode.usedAt ||
      pairingCode.expiresAt < new Date()
    ) {
      throw new UnauthorizedException(
        'Código de emparejamiento inválido o expirado',
      );
    }

    // updateMany + count en vez de update, para que la condición
    // `usedAt: null` actúe como guarda atómica contra dos peticiones
    // concurrentes usando el mismo código — solo una puede ganar la carrera.
    const claim = await this.prisma.pairingCode.updateMany({
      where: { id: pairingCode.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new UnauthorizedException('El código ya fue utilizado');
    }

    const apiKey = generateApiKey();
    const device = await this.prisma.device.create({
      data: {
        businessId: business.id,
        label: dto.deviceName,
        apiKeyHash: hashApiKey(apiKey),
      },
    });

    return { clientId: device.businessId, deviceApiKey: apiKey };
  }
}
