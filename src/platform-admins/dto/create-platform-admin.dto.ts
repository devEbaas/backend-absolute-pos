import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePlatformAdminDto {
  @ApiProperty({ example: 'Eduardo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'eduardo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ required: false, example: 'eduardo@absolutepos.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
