import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/** Métodos de pago de la app (specs/22 §4.1). `credit` no existe en la nube (specs/05 §6). */
export const SALE_PAYMENT_METHODS = ['efectivo', 'tarjeta', 'transferencia'];

// specs/22 §4.1. Los identificadores los genera SIEMPRE el cliente y son obligatorios: así un reintento tras un tiempo
// de espera nunca duplica una venta. Nada de lo que el servidor deriva se acepta del cliente (`subtotal`,
// `linkedProductName`): `forbidNonWhitelisted` lo rechaza con 400.
export class SaleItemInputDto {
  @ApiProperty() @IsUUID() id: string;
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty() @IsNumber() @IsPositive() quantity: number;
  @ApiProperty() @IsNumber() @Min(0) unitPrice: number;
}

export class CreateSaleDto {
  @ApiProperty()
  @IsUUID()
  id: string;

  // La caja abierta (propia y del dispositivo) en la que se vende.
  @ApiProperty()
  @IsUUID()
  sessionId: string;

  @ApiProperty({ example: 'efectivo', enum: SALE_PAYMENT_METHODS })
  @IsString()
  @IsIn(SALE_PAYMENT_METHODS)
  paymentMethod: string;

  // Sin `registerId`: la venta toma el de su sesión de caja (el nombre del dispositivo con el que se abrió).

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  // Lo que el cliente entregó y el cambio (M1, specs/22 §2): se conservan en la venta.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  paymentAmount?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  changeAmount?: number;

  @ApiProperty({ type: [SaleItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemInputDto)
  items: SaleItemInputDto[];
}
