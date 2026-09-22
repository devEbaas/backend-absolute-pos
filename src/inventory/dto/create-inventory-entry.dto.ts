import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsPositive,
  IsUUID,
  ValidateNested,
} from 'class-validator';

// specs/22 §5 — `POST /inventory-entries`.
export class InventoryEntryItemDto {
  // Puede ser una PRESENTACIÓN: el servidor resuelve el padre y multiplica por `unitsPerPack` (specs/04 §6).
  @ApiProperty() @IsUUID() productId: string;

  // Cantidad "de captura" (en unidades de la línea, no del padre).
  @ApiProperty() @IsNumber() @IsPositive() quantity: number;
}

export class CreateInventoryEntryDto {
  // El `entryId`: un UUID por confirmación, generado SIEMPRE en el cliente (idempotencia, specs/22 §1). Se guarda como
  // `referenceId` de cada movimiento, así que una "entrada" ya no se reconstruye agrupando por minuto (specs/04 §7.2).
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty({ type: [InventoryEntryItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => InventoryEntryItemDto)
  items: InventoryEntryItemDto[];
}
