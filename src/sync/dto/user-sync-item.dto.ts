import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsString, IsUUID } from 'class-validator';

// Cashier identity for report attribution only — password_hash/reset_code
// never leave the device. Local login stays entirely local.
export class UserSyncItemDto {
  @ApiProperty() @IsUUID() uuid: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() username: string;
  @ApiProperty() @IsString() role: string;
  @ApiProperty() @IsBoolean() active: boolean;
  @ApiProperty() @IsISO8601() createdAt: string;
  @ApiProperty() @IsISO8601() updatedAt: string;
}
