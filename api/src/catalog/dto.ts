import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Mode } from '@prisma/client';

export class CreateCustomerDto {
  @IsString() name: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxNumber?: string;
}

export class CreateRateCardDto {
  @IsEnum(Mode) mode: Mode;
  @IsString() origin: string;
  @IsString() destination: string;
  @IsNumber() @Min(0) ratePerUnit: number;
  @IsOptional() @IsNumber() @Min(0) minCharge?: number;
  @IsOptional() @IsNumber() @Min(0) fuelPct?: number;
  @IsOptional() @IsNumber() @Min(0) handling?: number;
}

export class UpdateRateCardDto {
  @IsOptional() @IsNumber() @Min(0) ratePerUnit?: number;
  @IsOptional() @IsNumber() @Min(0) minCharge?: number;
  @IsOptional() @IsNumber() @Min(0) fuelPct?: number;
  @IsOptional() @IsNumber() @Min(0) handling?: number;
}

export class CreateHsCodeDto {
  @IsString() code: string;
  @IsString() description: string;
  @IsNumber() @Min(0) dutyPct: number;
  @IsNumber() @Min(0) salesTaxPct: number;
  @IsOptional() @IsNumber() @Min(0) whtPct?: number;
}