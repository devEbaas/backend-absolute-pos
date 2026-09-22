import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBusinessSettingsDto } from './dto/update-business-settings.dto';
import { FIELD_TO_KEY, toCompanyInfo } from './company.util';

@Injectable()
export class BusinessSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(businessId: string) {
    const rows = await this.prisma.businessSetting.findMany({
      where: { businessId, key: { in: Object.values(FIELD_TO_KEY) } },
    });
    return toCompanyInfo(rows);
  }

  async update(businessId: string, dto: UpdateBusinessSettingsDto) {
    const entries = Object.entries(dto).filter(
      ([, value]) => value !== undefined,
    ) as [keyof UpdateBusinessSettingsDto, string | null][];

    await this.prisma.$transaction(
      entries.map(([field, value]) =>
        this.prisma.businessSetting.upsert({
          where: {
            businessId_key: { businessId, key: FIELD_TO_KEY[field] },
          },
          create: { businessId, key: FIELD_TO_KEY[field], value },
          update: { value },
        }),
      ),
    );

    return this.findAll(businessId);
  }
}
