import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaleItemInputDto {
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty() @IsNumber() @IsPositive() quantity: number;
  @ApiProperty() @IsNumber() @Min(0) unitPrice: number;
  @ApiProperty() @IsNumber() @Min(0) subtotal: number;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  linkedProductName?: string | null;
}

export class CreateSaleDto {
  @ApiProperty({ example: 'cash' })
  @IsString()
  paymentMethod: string;

  @ApiProperty({ required: false, default: 'PRINCIPAL' })
  @IsOptional()
  @IsString()
  registerId?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  sessionId?: string | null;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @ApiProperty({ type: [SaleItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemInputDto)
  items: SaleItemInputDto[];
}
