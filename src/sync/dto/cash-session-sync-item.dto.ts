import { ApiProperty } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CashSessionSyncItemDto {
  @ApiProperty() @IsUUID() uuid: string;
  @ApiProperty() @IsUUID() userUuid: string;
  @ApiProperty() @IsNumber() openingAmount: number;
  @ApiProperty() @IsString() status: string;
  @ApiProperty() @IsString() registerId: string;
  @ApiProperty() @IsISO8601() openedAt: string;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsISO8601()
  closedAt?: string | null;
  @ApiProperty() @IsISO8601() updatedAt: string;
}
