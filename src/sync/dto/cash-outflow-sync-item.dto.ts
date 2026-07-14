import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNumber, IsString, IsUUID } from 'class-validator';

export class CashOutflowSyncItemDto {
  @ApiProperty() @IsUUID() uuid: string;
  @ApiProperty() @IsUUID() sessionUuid: string;
  @ApiProperty() @IsUUID() userUuid: string;
  @ApiProperty() @IsNumber() amount: number;
  @ApiProperty() @IsString() reason: string;
  @ApiProperty() @IsISO8601() createdAt: string;
}
