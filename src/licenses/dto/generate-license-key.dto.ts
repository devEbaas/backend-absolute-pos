import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GenerateLicenseKeyDto {
  @ApiProperty({
    description:
      'Hardware ID mostrado en la pantalla de licencia del cliente (desktop o mobile) para el que se genera la clave.',
  })
  @IsString()
  @IsNotEmpty()
  hardwareId: string;
}
