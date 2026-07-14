import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateDeviceDto {
  @ApiProperty({
    example: 'CAJA-1',
    description: 'Nombre/identificador de la caja o instalación',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;
}
