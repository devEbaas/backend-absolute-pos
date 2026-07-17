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
}
