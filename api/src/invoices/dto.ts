import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateInvoiceStatusDto {
  // PARTIAL = part-paid: dueAmount is the amount still owed (PKR)
  @IsIn(['PAID', 'UNPAID', 'PARTIAL']) status: 'PAID' | 'UNPAID' | 'PARTIAL';

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() dueAmount?: number;
}


// One debit entry: money spent on an invoice (airline, customs, transport ...)
export class AddCostDto {
  @IsString() @IsNotEmpty() @MaxLength(120) label: string;
  @IsOptional() @IsString() @MaxLength(120) vendor?: string;
  // amount in `currency` (PKR when empty)
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  // PKR per 1 unit of the currency (needed when the currency is not PKR)
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() exRate?: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  @IsOptional() @IsDateString() incurredAt?: string;
}
