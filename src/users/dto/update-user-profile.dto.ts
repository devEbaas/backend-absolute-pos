import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

// Edición desde el dashboard del dueño (docs/dashboard-cliente-design-brief.md
// §5.5) — deliberadamente no incluye username/password/role: cambiar el
// username tocaría la lógica de unicidad de create(), y password/role tienen
// sus propios flujos (alta con password, futuro cambio de rol) que merecen
// su propia confirmación en vez de colarse en un editar-perfil genérico.
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
}
