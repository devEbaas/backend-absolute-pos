import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class PlatformAdminLoginDto {
  // Acepta username O email en el mismo campo — ver
  // PlatformAdminsService.login().
  @ApiProperty({ example: 'eduardo@absolutepos.com' })
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;
}
