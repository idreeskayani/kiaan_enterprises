import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ClearanceStatus } from '@prisma/client';

export class ChargeDto {
  @IsString() @IsNotEmpty() code: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount: number;
}

export class CreateClearanceDto {
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() customerAddress?: string;
  @IsOptional() @IsString() customerPhone?: string;
  @IsOptional() @IsString() customerTax?: string;
}

export class UpdateClearanceDto {
  @IsOptional() @IsString() @IsNotEmpty() customerName?: string;
  @IsOptional() @IsString() customerAddress?: string;
  @IsOptional() @IsString() customerPhone?: string;
  @IsOptional() @IsString() customerTax?: string;

  // expressOn, commodity, pcs, weightKg, invoiceRef, partyCode, beDate,
  // blNo, hawbNo, igmNo, beNo, demBillNo, wNo
  @IsOptional() @IsObject() details?: Record<string, string>;

  @IsOptional() @IsNumber() @Min(0) assessableValue?: number;
  // empty string clears it, undefined keeps it
  @IsOptional() @IsString() gdNo?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ChargeDto)
  charges?: ChargeDto[];
}

export class ClearanceStatusDto {
  @IsEnum(ClearanceStatus) status: ClearanceStatus;
  @IsOptional() @IsString() note?: string;
}

export class ClearancePaymentDto {
  @IsIn(['PAID', 'UNPAID', 'PARTIAL']) status: 'PAID' | 'UNPAID' | 'PARTIAL';
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() dueAmount?: number;
}