import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class PairDeviceDto {
  @ApiProperty({ example: 'abarrotes-la-esquina' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiProperty({ example: 'A1B2C3D4E5' })
  @IsString()
  @IsNotEmpty()
  pairingCode: string;

  @ApiProperty({ example: 'CAJA-1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  deviceName: string;

  // No hay deviceType aquí a propósito: el tipo de dispositivo lo decide el
  // operador al generar el pairing code (ver CreatePairingCodeDto), no el
  // cliente que empareja — mismo principio que client_id nunca viene del
  // payload del dispositivo. pair() copia PairingCode.platform al Device.
}
