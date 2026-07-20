import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// Edición desde el dashboard del dueño (docs/dashboard-cliente-design-brief.md
// §5.5) — deliberadamente no incluye username/password: cambiar el username
// tocaría la lógica de unicidad de create(), y password tiene su propio flujo
// (alta con password / reset futuro) que merece su propia confirmación en vez
// de colarse en un editar-perfil genérico. role sí se permite (ver
// UsersService.updateProfile — bloquea que un admin se autodegrade).
export class UpdateUserProfileDto {
  @ApiProperty({ required: false, example: 'Juan Pérez' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  // nullable además de optional: manda null explícito para vaciar el campo
  // (un cajero puede no tener email/teléfono), omitirlo deja el valor actual
  // sin tocar — @IsOptional() de class-validator no valida null tampoco.
  @ApiProperty({ required: false, nullable: true, example: 'juan@cafeaurora.com' })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiProperty({ required: false, nullable: true, example: '+52 55 1234 0011' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiProperty({ required: false, enum: ['admin', 'cashier'] })
  @IsOptional()
  @IsIn(['admin', 'cashier'])
  role?: string;
}
