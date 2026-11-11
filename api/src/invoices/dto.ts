import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

// How a payment was made. Sent together with PAID / PARTIAL.
export class PaymentInfoDto {
  @IsOptional() @IsIn(['CASH', 'CHEQUE', 'ONLINE']) method?: 'CASH' | 'CHEQUE' | 'ONLINE';
  // cheque number (required for CHEQUE) or online transaction reference
  @IsOptional() @IsString() @MaxLength(60) reference?: string;
  // optional proof picture as a data URL (the web app shrinks it before sending)
  @IsOptional()
  @IsString()
  @MaxLength(2_800_000)
  @Matches(/^data:image\/(jpeg|png|webp);base64,/, { message: 'Picture must be a JPG, PNG or WebP image' })
  image?: string;
}

export class UpdateInvoiceStatusDto extends PaymentInfoDto {
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

// Payment of a debit (what we owe a vendor). PARTIAL: dueAmount is what is still owed (PKR)
export class UpdateCostPaymentDto extends PaymentInfoDto {
  @IsIn(['PAID', 'UNPAID', 'PARTIAL']) status: 'PAID' | 'UNPAID' | 'PARTIAL';

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() dueAmount?: number;
}

// Save the customer's remaining-dues statement: DRAFT = kept for later, SENT = shared with the customer
export class SaveDuesReportDto {
  @IsOptional() @IsIn(['DRAFT', 'SENT']) status?: 'DRAFT' | 'SENT';
  // which invoices the report lists (DUES by default)
  @IsOptional() @IsIn(['ALL', 'DUES', 'UNPAID', 'PAID', 'DRAFT']) scope?: 'ALL' | 'DUES' | 'UNPAID' | 'PAID' | 'DRAFT';
  // optional date range (YYYY-MM-DD) of the invoices the report lists
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Dates must look like YYYY-MM-DD' }) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Dates must look like YYYY-MM-DD' }) to?: string;
}
