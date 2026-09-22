import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

// specs/22 §4.3 — `POST /cash-sessions/:id/close-with-cut`. El cliente NUNCA manda totales: el servidor los recalcula.
export class CloseWithCutDto {
  // UUID del corte, generado SIEMPRE en el cliente (idempotencia, specs/22 §1).
  @ApiProperty()
  @IsUUID()
  id: string;

  // Efectivo realmente contado en el cajón. Opcional (C8): sin él, `actualCash` y `cashDifference` quedan `null`.
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  actualCash?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;
}
