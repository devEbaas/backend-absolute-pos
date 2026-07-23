import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// Mismas claves que posEditions en absolute-systems-web (src/data/posContent.ts)
export const DEMO_REQUEST_EDITIONS = ['offline', 'cloud', 'tablet'] as const;
export type DemoRequestEdition = (typeof DEMO_REQUEST_EDITIONS)[number];

export class CreateDemoRequestDto {
  @ApiProperty({ example: 'Marisol Iglesias' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'Abarrotes La Esquina', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  businessName?: string;

  @ApiProperty({ example: 'cloud', enum: DEMO_REQUEST_EDITIONS })
  @IsIn(DEMO_REQUEST_EDITIONS)
  edition: DemoRequestEdition;
}
