import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDeviceDto {
  @ApiProperty({
    example: 'CAJA-1',
    description: 'Nombre/identificador de la caja o instalación',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @ApiProperty({
    required: false,
    enum: ['desktop', 'mobile'],
    default: 'desktop',
  })
  @IsOptional()
  @IsIn(['desktop', 'mobile'])
  deviceType?: string;
}
