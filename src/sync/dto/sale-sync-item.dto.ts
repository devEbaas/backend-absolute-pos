import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class SaleSyncItemDto {
  @ApiProperty() @IsUUID() uuid: string;
  @ApiProperty() @IsUUID() userUuid: string;
  @ApiProperty() @IsNumber() total: number;
  @ApiProperty() @IsString() paymentMethod: string;
  @ApiProperty() @IsString() registerId: string;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  sessionUuid?: string | null;
  @ApiProperty() @IsBoolean() cancelled: boolean;
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
  @ApiProperty() @IsNumber() discountAmount: number;
  @ApiProperty() @IsISO8601() createdAt: string;
  @ApiProperty() @IsISO8601() updatedAt: string;
}
