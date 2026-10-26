import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
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

export class RateDto {
  @IsNumber() @Min(0) ratePerUnit: number;
  @IsOptional() @IsNumber() @Min(0) minCharge?: number;
  @IsOptional() @IsNumber() @Min(0) fuelPct?: number;
  @IsOptional() @IsNumber() @Min(0) handling?: number;
  @IsOptional() @IsInt() @Min(1) volDivisor?: number;
}

export class ExtraChargeDto {
  @IsString() @IsNotEmpty() label: string;
  @IsNumber() @Min(0) amount: number;
  // currency of this charge (defaults to the shipment currency)
  @IsOptional() @Matches(/^[A-Za-z]{3}$/) currency?: string;
  // PKR per 1 unit of that currency (needed when it differs from the shipment currency)
  @IsOptional() @IsNumber() @Min(0) exRate?: number;
}

export class QuoteDto {
  @IsEnum(Mode) mode: Mode;
  @IsString() @IsNotEmpty() origin: string;
  @IsString() @IsNotEmpty() destination: string;
  @IsOptional() @IsArray() @IsString({ each: true }) viaPoints?: string[];
  @IsOptional() @IsNumber() @Min(0) goodsValue?: number;

  @IsOptional() @ValidateNested() @Type(() => RateDto) rate?: RateDto;
  @IsOptional() @IsNumber() @Min(0) freightOverride?: number;
  @IsOptional() @IsString() freightLabel?: string;

  // Freight is calculated in this currency and converted to PKR at exRate
  @IsOptional() @Matches(/^[A-Za-z]{3}$/) currency?: string;
  @IsOptional() @IsNumber() @Min(0) exRate?: number;

  // D/O charges, always in PKR
  @IsOptional() @IsNumber() @Min(0) doCharges?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtraChargeDto)
  extraCharges?: ExtraChargeDto[];

  // Optional invoice details: direction, airline, shipper, commodity, custRef,
  // etd, mawbDate, hawbDate, doNo, doDate, igmNo, igmDate, beNo, beDate
  @IsOptional() @IsObject() details?: Record<string, string>;

  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  @ArrayMinSize(1)
  items: ItemDto[];
}

export class CreateShipmentDto extends QuoteDto {
  @IsUUID() customerId: string;
  @IsOptional() @IsString() blAwbNo?: string;
  @IsOptional() @IsString() hawbNo?: string;
  @IsOptional() @IsString() flight?: string;
  @IsOptional() @IsDateString() eta?: string;
}

export class UpdateStatusDto {
  @IsEnum(ShipmentStatus) status: ShipmentStatus;
  @IsOptional() @IsString() note?: string;
}