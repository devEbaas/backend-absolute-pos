import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ProductsQueryDto {
  // Query strings arrive as "true"/"false" text — Boolean("false") would
  // otherwise evaluate truthy, so this parses the literal string instead of
  // relying on @Type(() => Boolean).
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeStock?: boolean = false;
}
