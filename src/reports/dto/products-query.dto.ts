import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ProductsQueryDto {
  // Query strings arrive as "true"/"false" text — Boolean("false") would
  // otherwise evaluate truthy, so this parses the literal string instead of
  // relying on @Type(() => Boolean).
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeStock?: boolean = false;

  @ApiPropertyOptional({
    description:
      'Filtra por nombre o código de barras (contiene, sin distinguir mayúsculas).',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: ['active', 'low', 'out'],
    description:
      'Filtra por estado de stock (solo aplica si includeStock=true).',
  })
  @IsOptional()
  @IsIn(['active', 'low', 'out'])
  stockStatus?: 'active' | 'low' | 'out';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  // Tope más alto que en ventas (25/100): Resumen y Ventas todavía piden
  // este mismo endpoint sin filtro para armar catálogos completos en
  // memoria (alertas de stock bajo, lookup de nombres) — ver
  // useResumenData.ts/useVentasData.ts en pos-client-dashboard.
  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 25;
}
