import { ApiProperty } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class InventoryMovementSyncItemDto {
  @ApiProperty() @IsUUID() uuid: string;
  @ApiProperty() @IsUUID() productUuid: string;
  @ApiProperty() @IsString() type: string;
  @ApiProperty() @IsNumber() quantity: number;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  reference?: string | null;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  referenceUuid?: string | null;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  linkedProductName?: string | null;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  userUuid?: string | null;
  @ApiProperty() @IsISO8601() createdAt: string;
}
