import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

// specs/22 §3.5 — `GET /inventory-movements?type&reference&productId&limit`.
export class MovementsQueryDto {
  @ApiProperty({ required: false, enum: ['IN', 'OUT'] })
  @IsOptional()
  @IsIn(['IN', 'OUT'])
  type?: string;

  @ApiProperty({ required: false, example: 'PRODUCT_ENTRY' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({ required: false, default: 100, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}
