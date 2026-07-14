import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class SaleItemSyncItemDto {
  @ApiProperty() @IsUUID() uuid: string;
  @ApiProperty() @IsUUID() saleUuid: string;
  @ApiProperty() @IsUUID() productUuid: string;
  @ApiProperty() @IsNumber() quantity: number;
  @ApiProperty() @IsNumber() unitPrice: number;
  @ApiProperty() @IsNumber() subtotal: number;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  linkedProductName?: string | null;
}
