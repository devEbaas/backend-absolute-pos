import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWebQuoteRequestDto {
  @ApiProperty({ example: 'COT-IZML-VLS' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  quoteCode: string;

  @ApiProperty({ example: 'Marisol Iglesias' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: '999 123 4567' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  contact: string;

  @ApiProperty({ required: false, example: 'Podemos empezar en octubre' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
