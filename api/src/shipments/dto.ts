import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Mode, ShipmentStatus } from '@prisma/client';

export class ItemDto {
  @IsNumber() @Min(0) lengthCm: number;
  @IsNumber() @Min(0) widthCm: number;
  @IsNumber() @Min(0) heightCm: number;
  @IsNumber() @Min(0) weightKg: number;
  @IsInt() @Min(1) qty: number;
}

export class QuoteDto {
  @IsEnum(Mode) mode: Mode;
  @IsString() origin: string;
  @IsString() destination: string;
  @IsOptional() @IsUUID() hsCodeId?: string;
  @IsNumber() @Min(0) goodsValue: number;
  @IsOptional() @IsNumber() @Min(0) insurance?: number;

  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  @ArrayMinSize(1)
  items: ItemDto[];
}

export class CreateShipmentDto extends QuoteDto {
  @IsUUID() customerId: string;
  @IsOptional() @IsString() blAwbNo?: string;
  @IsOptional() @IsDateString() eta?: string;
}

export class UpdateStatusDto {
  @IsEnum(ShipmentStatus) status: ShipmentStatus;
  @IsOptional() @IsString() note?: string;
}
