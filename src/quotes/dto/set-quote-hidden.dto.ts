import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetQuoteHiddenDto {
  @ApiProperty() @IsBoolean() hidden: boolean;
}
