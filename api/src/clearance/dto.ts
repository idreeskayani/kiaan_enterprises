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
import { PaymentInfoDto } from '../invoices/dto.js';

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
}
