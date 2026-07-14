import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsISO8601,
  IsInt,
  IsNumber,
  IsString,
  IsUUID,
} from 'class-validator';

export class PromotionSyncItemDto {
  @ApiProperty() @IsUUID() uuid: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() type: string;
  @ApiProperty() @IsInt() requiredQuantity: number;
  @ApiProperty() @IsString() discountType: string;
  @ApiProperty() @IsNumber() discountValue: number;
  @ApiProperty() @IsInt() freeQuantity: number;
  @ApiProperty() @IsBoolean() active: boolean;
  @ApiProperty() @IsISO8601() createdAt: string;
  @ApiProperty() @IsISO8601() updatedAt: string;
}
