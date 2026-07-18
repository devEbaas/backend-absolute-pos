import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'juan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  // Opcional — si se omite, UsersService.create() genera una password
  // aleatoria y la devuelve en texto plano una sola vez en la respuesta
  // (mismo patrón que el device api key). Pensado para pos-root-dashboard,
  // que no pide password en el modal de alta de usuario.
  @ApiProperty({ required: false, minLength: 6 })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiProperty({
    required: false,
    enum: ['admin', 'cashier'],
    default: 'cashier',
  })
  @IsOptional()
  @IsIn(['admin', 'cashier'])
  role?: string;

  @ApiProperty({ required: false, example: 'juan@cafeaurora.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false, example: '+52 55 1234 0011' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}
