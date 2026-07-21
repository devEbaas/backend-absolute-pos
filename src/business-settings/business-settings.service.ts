import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBusinessSettingsDto } from './dto/update-business-settings.dto';

// Mismas claves que absolute-pos-app guarda localmente en su tabla
// `settings` (ver src/main/ipc/settings.ipc.js: 'company_name',
// 'company_rfc', 'company_phone', 'company_address', 'company_email',
// 'company_website', 'company_logo') — se reusa el nombre para que quede
// claro que es el mismo dato, aunque aquí vive en Postgres (BusinessSetting,
// key/value por businessId) en vez de en el SQLite de cada caja. A
// diferencia de esa tabla local, esto nunca pasa por /sync — es
// exclusivamente para que el dashboard del dueño lea/edite el dato central.
const FIELD_TO_KEY: Record<keyof UpdateBusinessSettingsDto, string> = {
  companyName: 'company_name',
  rfc: 'company_rfc',
  phone: 'company_phone',
  address: 'company_address',
  email: 'company_email',
  website: 'company_website',
  logo: 'company_logo',
};

const KEY_TO_FIELD = Object.fromEntries(
  Object.entries(FIELD_TO_KEY).map(([field, key]) => [key, field]),
) as Record<string, keyof UpdateBusinessSettingsDto>;

@Injectable()
export class BusinessSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(businessId: string) {
    const rows = await this.prisma.businessSetting.findMany({
      where: { businessId, key: { in: Object.values(FIELD_TO_KEY) } },
    });

    const result: Record<string, string | null> = {
      companyName: null,
      rfc: null,
      phone: null,
      address: null,
      email: null,
      website: null,
      logo: null,
    };
    for (const row of rows) {
      const field = KEY_TO_FIELD[row.key];
      if (field) {
        result[field] = row.value;
      }
    }
    return result;
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
