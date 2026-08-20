import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class QuotesQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'expired', 'converted', 'cancelled'] })
  @IsOptional()
  @IsIn(['open', 'expired', 'converted', 'cancelled'])
  status?: string;

  // Query strings arrive as "true"/"false" text — Boolean("false") would
  // otherwise evaluate truthy, so this parses the literal string instead of
  // relying on @Type(() => Boolean) (same fix as ProductsQueryDto.includeStock).
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeHidden?: boolean = false;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-07-19' })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}
