import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class OpenCashSessionDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  openingAmount: number;

  @ApiProperty({ required: false, default: 'PRINCIPAL' })
  @IsOptional()
  @IsString()
  registerId?: string;
}
