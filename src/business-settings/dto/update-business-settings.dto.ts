import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

// Reemplaza lo que hoy guarda absolute-pos-app localmente (tabla `settings`,
// nunca sincronizada — ver src/main/ipc/settings.ipc.js en ese repo) por su
// equivalente en la nube, para que el dueño lo edite desde
// pos-business-dashboard sin depender de una caja física. Todos los campos
// son opcionales y nullable: mandar null borra el valor, omitirlo lo deja
// sin tocar (mismo patrón que UpdateUserProfileDto).
export class UpdateBusinessSettingsDto {
  @ApiProperty({ required: false, nullable: true, example: 'Café Aurora' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'AURJ800101ABC' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  rfc?: string | null;

  @ApiProperty({ required: false, nullable: true, example: '+52 55 1234 0011' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'Av. Reforma 123, CDMX',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'contacto@cafeaurora.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'https://cafeaurora.com',
  })
  @IsOptional()
  @IsUrl()
  website?: string | null;

  // Data URI base64 (ej. "data:image/png;base64,...") usado para el ticket
  // impreso. No hay infraestructura de subida de archivos en este backend
  // todavía (sin multer en ningún otro controller) — se guarda como texto
  // igual que lo hace hoy Electron localmente. El límite evita abuso; si el
  // logo real necesita ser más grande, esto debe migrar a almacenamiento de
  // archivos dedicado.
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(3_000_000)
  logo?: string | null;
}
