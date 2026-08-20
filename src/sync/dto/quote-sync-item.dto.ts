import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class QuoteSyncItemDto {
  @ApiProperty() @IsUUID() uuid: string;
  @ApiProperty() @IsUUID() userUuid: string;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  customerName?: string | null;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  customerPhone?: string | null;
  @ApiProperty() @IsNumber() subtotal: number;
  @ApiProperty() @IsNumber() discountAmount: number;
  @ApiProperty() @IsNumber() total: number;
  @ApiProperty() @IsString() status: string;
  // Fecha pura YYYY-MM-DD, no ISO8601 con hora — ver comentario en el modelo
  // Prisma Quote.validUntil.
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  validUntil?: string | null;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  convertedSaleUuid?: string | null;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsISO8601()
  convertedAt?: string | null;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsISO8601()
  cancelledAt?: string | null;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  cancelledByUuid?: string | null;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  cancellationReason?: string | null;
  @ApiProperty() @IsBoolean() hidden: boolean;
  @ApiProperty() @IsString() registerId: string;
  @ApiProperty() @IsISO8601() createdAt: string;
  @ApiProperty() @IsISO8601() updatedAt: string;
}
