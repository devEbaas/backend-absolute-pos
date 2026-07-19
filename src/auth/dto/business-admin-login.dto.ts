import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class BusinessAdminLoginDto {
  // No hay device que resuelva el negocio, así que el dueño lo identifica
  // por slug — ver AuthService.loginOwner() / BusinessesService.findBySlug().
  @ApiProperty({ example: 'mi-tienda' })
  @IsString()
  @IsNotEmpty()
  businessSlug: string;

  @ApiProperty({ example: 'admin' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;
}
