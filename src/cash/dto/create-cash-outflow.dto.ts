import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

// specs/22 §4.2. `amount` y `reason` NO se validan aquí con `class-validator`: sus errores saldrían como una LISTA de
// textos en inglés, y el contrato pide el mensaje en español de una sola cadena y en el orden del desktop (primero la
// sesión, luego el monto, luego el motivo; specs/03 §2.3). Las reglas (`El monto debe ser mayor a cero`, `El motivo es
// obligatorio`) las aplica `CashService.createOutflow`; aquí solo se garantiza la forma.
export class CreateCashOutflowDto {
  // UUID de la salida, generado SIEMPRE en el cliente (idempotencia, specs/22 §1).
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  sessionId: string;

  @ApiProperty()
  @IsOptional()
  amount: number;

  @ApiProperty()
  @IsOptional()
  @IsString()
  reason: string;
}
