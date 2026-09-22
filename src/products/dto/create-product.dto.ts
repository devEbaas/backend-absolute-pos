import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateProductDto {
  // UUID del producto (specs/22 §6.1). La app móvil lo genera SIEMPRE y es obligatorio para un token de dispositivo
  // (idempotencia: un reintento no duplica el producto ni su stock inicial); el dashboard del dueño, que no lo manda,
  // recibe uno generado por el servidor. La regla vive en `ProductsService.create`.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  barcode?: string | null;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  salePrice: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  purchaseCost: number;

  @ApiProperty({ required: false, default: 'UNIDAD' })
  @IsOptional()
  @IsString()
  tipoVenta?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  imagePath?: string | null;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  parentProductId?: string | null;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  unitsPerPack?: number;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  location?: string | null;

  // Existencia con la que nace el producto: un `IN` `INITIAL_STOCK` en la misma transacción. Se ignora en las
  // presentaciones y en los tipos sin inventario.
  @ApiProperty({ required: false, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialStock?: number;
}

// La identidad (`id`) y el stock inicial son del alta: aquí `forbidNonWhitelisted` los rechaza con 400.
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['id', 'initialStock'] as const),
) {
  // Existencia por valor ABSOLUTO: el servidor calcula la diferencia contra el stock actual y registra un ajuste.
  @ApiProperty({ required: false, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;
}
