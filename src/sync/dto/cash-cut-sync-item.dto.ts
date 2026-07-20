import { ApiProperty } from '@nestjs/swagger';
import {
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CashCutSyncItemDto {
  @ApiProperty() @IsUUID() uuid: string;
  @ApiProperty() @IsUUID() sessionUuid: string;
  @ApiProperty() @IsUUID() userUuid: string;
  @ApiProperty() @IsString() cutType: string;
  @ApiProperty() @IsNumber() openingAmount: number;
  @ApiProperty() @IsNumber() totalCashSales: number;
  @ApiProperty() @IsNumber() totalCardSales: number;
  // Optional — pushed by desktop app versions >= the transfer-bucket
  // rollout; older clients omit it and fall back to 0 (see upsertFromSync).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  totalTransferSales?: number;
  @ApiProperty() @IsNumber() totalOtherSales: number;
  @ApiProperty() @IsNumber() totalSales: number;
  @ApiProperty() @IsNumber() totalCancelledAmount: number;
  @ApiProperty() @IsInt() cancelledCount: number;
  @ApiProperty() @IsNumber() expectedCash: number;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  actualCash?: number | null;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  cashDifference?: number | null;
  @ApiProperty() @IsInt() transactionCount: number;
  @ApiProperty() @IsNumber() totalOutflows: number;
  @ApiProperty() @IsInt() outflowCount: number;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;
  @ApiProperty() @IsISO8601() createdAt: string;
}
