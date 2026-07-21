import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

// Cambio de contraseña propio — pantalla "Perfil" del dashboard del dueño.
// Exige la contraseña actual (UsersService.changeOwnPassword la valida con
// bcrypt antes de reemplazar el hash) para que un token robado/olvidado en
// una sesión abierta no baste para tomar la cuenta.
export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  newPassword: string;
}
