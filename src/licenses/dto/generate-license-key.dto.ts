import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class GenerateLicenseKeyDto {
  // 32 caracteres hex — ver generateHardwareId() en license.service.js del
  // cliente (sha256 truncado a 32 chars, mayúsculas).
  @ApiProperty({ example: 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-F0-9]{32}$/i, {
    message: 'hardwareId debe ser un hash hexadecimal de 32 caracteres',
  })
  hardwareId: string;
}
