import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCashCutDto {
  @ApiProperty()
  @IsUUID()
  sessionId: string;

  @ApiProperty({ enum: ['total', 'partial'], default: 'total', required: false })
  @IsOptional()
  @IsIn(['total', 'partial'])
  cutType?: string;

  // Cash actually counted in the drawer — compared against the
  // server-computed expectedCash to produce cashDifference. Omit for a
  // cut that doesn't reconcile physical cash.
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  actualCash?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;
}
