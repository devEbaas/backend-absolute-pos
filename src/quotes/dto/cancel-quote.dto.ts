import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CancelQuoteDto {
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  reason?: string | null;
}
