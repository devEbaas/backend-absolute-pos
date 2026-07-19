import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CashOutflowsQueryDto {
  @ApiProperty()
  @IsUUID()
  sessionId: string;
}
