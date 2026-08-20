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

export class QuoteItemInputDto {
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty() @IsNumber() @IsPositive() quantity: number;
  @ApiProperty() @IsNumber() @Min(0) unitPrice: number;
}

export class CreateQuoteDto {
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  customerName?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  customerPhone?: string | null;

  // Fecha pura YYYY-MM-DD (sin hora) — misma convención que Quote.validUntil
  // en schema.prisma / valid_until en el desktop.
  @ApiProperty({ required: false, nullable: true, example: '2026-09-04' })
  @IsOptional()
  @IsString()
  validUntil?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @ApiProperty({ type: [QuoteItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemInputDto)
  items: QuoteItemInputDto[];
}
