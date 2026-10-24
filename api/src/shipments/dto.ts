import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Mode, ShipmentStatus } from '@prisma/client';

export class ItemDto {
  @IsNumber() @Min(0) lengthCm: number;
  @IsNumber() @Min(0) widthCm: number;
  @IsNumber() @Min(0) heightCm: number;
  @IsNumber() @Min(0) weightKg: number;
  @IsInt() @Min(1) qty: number;
}

export class RateDto {
  @IsNumber() @Min(0) ratePerUnit: number;
  @IsOptional() @IsNumber() @Min(0) minCharge?: number;
  @IsOptional() @IsNumber() @Min(0) fuelPct?: number;
  @IsOptional() @IsNumber() @Min(0) handling?: number;
  @IsOptional() @IsInt() @Min(1) volDivisor?: number;
}

export class TaxDto {
  @IsNumber() @Min(0) dutyPct: number;
  @IsNumber() @Min(0) salesTaxPct: number;
  @IsNumber() @Min(0) whtPct: number;
}

export class QuoteDto {
  @IsEnum(Mode) mode: Mode;
  @IsString() @IsNotEmpty() origin: string;
  @IsString() @IsNotEmpty() destination: string;
  @IsOptional() @IsArray() @IsString({ each: true }) viaPoints?: string[];
  @IsOptional() @IsUUID() hsCodeId?: string;
  @IsNumber() @Min(0) goodsValue: number;
  @IsOptional() @IsNumber() @Min(0) insurance?: number;

  // Your own freight settings. If omitted, the saved rate card for the route is used.
  @IsOptional() @ValidateNested() @Type(() => RateDto) rate?: RateDto;
  // Fixed total freight. Overrides the rate calculation.
  @IsOptional() @IsNumber() @Min(0) freightOverride?: number;
  @IsOptional() @IsNumber() @Min(0) doCharges?: number;
  // Duty and tax percentages. If omitted, the HS code's percentages are used.
  @IsOptional() @ValidateNested() @Type(() => TaxDto) tax?: TaxDto;

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