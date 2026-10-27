import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ClearanceStatus } from '@prisma/client';

export class ChargeDto {
  @IsString() @IsNotEmpty() label: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount: number;
}

export class CreateClearanceDto {
  // import a Kiaan shipment invoice (customer, shipment details and freight lines are copied)
  @IsOptional() @IsUUID() sourceInvoiceId?: string;

  // without an import the customer is typed in
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

  // mode, origin, destination, blNo, hawbNo, flight, commodity, pcs, weightKg,
  // igmNo, igmDate, beDate, custRef
  @IsOptional() @IsObject() details?: Record<string, string>;

  // null clears the HS code, undefined keeps it
  @IsOptional() @IsString() hsCodeId?: string | null;
  @IsOptional() @IsNumber() @Min(0) assessableValue?: number;
  // empty string clears it, undefined keeps it
  @IsOptional() @IsString() gdNo?: string;

  // add the imported Kiaan freight lines to this invoice
  @IsOptional() @IsBoolean() includeFreight?: boolean;

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