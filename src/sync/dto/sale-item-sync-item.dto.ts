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
  // Opcional: costo unitario congelado al vender. Las cajas anteriores a la
  // feature de ganancia no lo mandan y queda null.
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  unitCost?: number | null;
}
