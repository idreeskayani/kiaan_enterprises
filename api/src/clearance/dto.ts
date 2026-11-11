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
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { ClearanceStatus } from '@prisma/client';
import { PaymentInfoDto } from '../invoices/dto.js';

export class ChargeDto {
  @IsString() @IsNotEmpty() code: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount: number;
}

export class NocDto {
  @IsString() @IsNotEmpty() type: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount: number;
}

export class BiltyDto {
  @IsString() @IsNotEmpty() origin: string;
  @IsString() @IsNotEmpty() destination: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) rent: number;
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

  // PSW collectorate, free text (empty string clears it)
  @IsOptional() @IsString() collectorate?: string;
  // empty string clears it
  @IsOptional() @IsIn(['', 'AIR', 'SEA', 'ROAD', 'RAIL']) modeOfTransport?: string;
  @IsOptional() @IsString() virNumber?: string;

  // assessed duties: cess, customsDuty, salesTax, additionalSalesTax, incomeTax (PKR)
  @IsOptional() @IsObject() duties?: Record<string, number>;
  // empty string clears it, undefined keeps it
  @IsOptional() @IsString() gdNo?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ChargeDto)
  charges?: ChargeDto[];

  // the client paid the duties & taxes through PSID: shown on the bill, not added to the total
  @IsOptional() @IsBoolean() paidThroughPsid?: boolean;

  // container numbers (the whole list is sent each time)
  @IsOptional() @IsArray() @IsString({ each: true }) containers?: string[];

  // NOC types with their charge (the whole list is sent each time)
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => NocDto)
  nocs?: NocDto[];

  // bilty transport; null removes it, undefined keeps it
  @IsOptional() @ValidateNested() @Type(() => BiltyDto)
  biltyTransport?: BiltyDto | null;
}

export class ClearanceStatusDto {
  @IsEnum(ClearanceStatus) status: ClearanceStatus;
  @IsOptional() @IsString() note?: string;
}

// Same payment details as freight: cash / cheque (number) / online (reference) and an optional picture
export class ClearancePaymentDto extends PaymentInfoDto {
  @IsIn(['PAID', 'UNPAID', 'PARTIAL']) status: 'PAID' | 'UNPAID' | 'PARTIAL';
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() dueAmount?: number;
}

// Save the statement of one clearance customer: DRAFT = kept for later, SENT = shared with the customer
export class SaveClearanceReportDto {
  @IsString() @IsNotEmpty() customer: string;
  @IsOptional() @IsIn(['DRAFT', 'SENT']) status?: 'DRAFT' | 'SENT';
  // which invoices it lists (the clearance invoice filters; ALL by default)
  @IsOptional() @IsIn(['ALL', 'PARTIAL', 'UNPAID', 'PAID', 'DRAFT']) scope?: 'ALL' | 'PARTIAL' | 'UNPAID' | 'PAID' | 'DRAFT';
  // optional date range (YYYY-MM-DD) of the invoices the report lists
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Dates must look like YYYY-MM-DD' }) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Dates must look like YYYY-MM-DD' }) to?: string;
}
