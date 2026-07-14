import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

// Shape pushed by a device for one product row. `uuid` is the
// client-generated identity (see migration v14 in absolute-electron-pos)
// and becomes the Postgres primary key directly — no separate mapping
// table. FKs reference uuids too (parentProductUuid), never local
// integer ids, since those are only unique per-device.
export class ProductSyncItemDto {
  @ApiProperty()
  @IsUUID()
  uuid: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  barcode?: string | null;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty()
  @IsNumber()
  salePrice: number;

  @ApiProperty()
  @IsNumber()
  purchaseCost: number;

  @ApiProperty()
  @IsString()
  tipoVenta: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  imagePath?: string | null;

  @ApiProperty()
  @IsBoolean()
  active: boolean;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  parentProductUuid?: string | null;

  @ApiProperty()
  @IsNumber()
  unitsPerPack: number;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  location?: string | null;

  @ApiProperty()
  @IsISO8601()
  createdAt: string;

  @ApiProperty()
  @IsISO8601()
  updatedAt: string;
}
