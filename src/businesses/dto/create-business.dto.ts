import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

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

  // El negocio se crea junto con su primer usuario (role: admin) — ver
  // BusinessesService.create(). Ese usuario recibe una password generada
  // por el servidor, devuelta una sola vez en la respuesta.
  @ApiProperty({ example: 'Marisol Iglesias' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  ownerName: string;

  @ApiProperty({ example: 'marisol@cafeaurora.com' })
  @IsEmail()
  ownerEmail: string;

  @ApiProperty({ example: '+52 55 1234 0001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  ownerPhone: string;
}
