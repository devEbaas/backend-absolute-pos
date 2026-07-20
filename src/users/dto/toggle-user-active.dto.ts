import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleUserActiveDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  active: boolean;
}
