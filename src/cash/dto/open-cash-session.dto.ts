import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsUUID, Min } from 'class-validator';

export class OpenCashSessionDto {
  // UUID de la sesión, generado SIEMPRE en el cliente (idempotencia, specs/22 §1): un reintento tras un tiempo de espera
  // nunca abre dos cajas.
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  openingAmount: number;

  // Sin `registerId`: lo pone el servidor con el nombre del dispositivo del token (`Device.label`), así que
  // `forbidNonWhitelisted` rechaza con 400 cualquier valor que mande el cliente.
}
