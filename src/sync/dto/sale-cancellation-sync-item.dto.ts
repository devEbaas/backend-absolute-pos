import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class SaleCancellationSyncItemDto {
  @ApiProperty() @IsUUID() uuid: string;
  @ApiProperty() @IsUUID() saleUuid: string;
  @ApiProperty() @IsUUID() cancelledByUuid: string;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  reason?: string | null;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;
  @ApiProperty() @IsISO8601() createdAt: string;
}
