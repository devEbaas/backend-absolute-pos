import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateOfflineLicenseRequestDto {
  // 32 caracteres hex — ver generateHardwareId() en license.service.js del
  // cliente (sha256 truncado a 32 chars, mayúsculas).
  @ApiProperty({ example: 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-F0-9]{32}$/i, {
    message: 'hardwareId debe ser un hash hexadecimal de 32 caracteres',
  })
  hardwareId: string;

  @ApiProperty({ example: 'Marisol Iglesias', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string;

  @ApiProperty({ example: 'Abarrotes La Esquina', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  businessName?: string;
}
