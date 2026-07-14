import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateBusinessDto {
  @ApiProperty({ example: 'Abarrotes La Esquina' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;
}
