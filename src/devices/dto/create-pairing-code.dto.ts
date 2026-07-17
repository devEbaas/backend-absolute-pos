import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class CreatePairingCodeDto {
  @ApiProperty({
    required: false,
    enum: ['desktop', 'mobile'],
    default: 'desktop',
    description:
      'Tipo de dispositivo que va a emparejar con este código — lo elige quien lo genera, no el dispositivo.',
  })
  @IsOptional()
  @IsIn(['desktop', 'mobile'])
  deviceType?: string;
}
