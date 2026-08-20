import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

// Join row — mismo criterio conocido que PromotionProductSyncItemDto: el
// desktop hace DELETE+reinsert de todos los items al editar una cotización
// abierta, y eso no se propaga como borrado a la nube (append-only en la
// nube). Aceptable por ahora: el total/subtotal autoritativo vive en el
// propio Quote, que sí se actualiza correctamente.
export class QuoteItemSyncItemDto {
  @ApiProperty() @IsUUID() uuid: string;
  @ApiProperty() @IsUUID() quoteUuid: string;
  @ApiProperty() @IsUUID() productUuid: string;
  @ApiProperty() @IsNumber() quantity: number;
  @ApiProperty() @IsNumber() unitPrice: number;
  @ApiProperty() @IsNumber() subtotal: number;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  linkedProductName?: string | null;
}
