import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateBusinessDto {
  @ApiProperty({ example: 'Abarrotes La Esquina' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  // Identificador legible que el root_admin de una caja captura a mano al
  // emparejarla (ver POST /devices/pair) — solo minúsculas, números y guiones.
  @ApiProperty({ example: 'abarrotes-la-esquina' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug solo puede contener minúsculas, números y guiones',
  })
  slug: string;
}
