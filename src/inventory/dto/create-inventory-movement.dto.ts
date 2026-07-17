import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateInventoryMovementDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({ enum: ['IN', 'OUT'], default: 'IN', required: false })
  @IsOptional()
  @IsIn(['IN', 'OUT'])
  type?: string;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiProperty({ required: false, default: 'PRODUCT_ENTRY' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  linkedProductName?: string | null;
}
