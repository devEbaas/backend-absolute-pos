import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  barcode?: string | null;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  salePrice: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  purchaseCost: number;

  @ApiProperty({ required: false, default: 'UNIDAD' })
  @IsOptional()
  @IsString()
  tipoVenta?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  imagePath?: string | null;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  parentProductId?: string | null;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  unitsPerPack?: number;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  location?: string | null;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}
