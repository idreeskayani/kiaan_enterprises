import { IsIn, IsNumber, IsOptional, IsPositive } from 'class-validator';

export class UpdateInvoiceStatusDto {
  // PARTIAL = part-paid: dueAmount is the amount still owed (PKR)
  @IsIn(['PAID', 'UNPAID', 'PARTIAL']) status: 'PAID' | 'UNPAID' | 'PARTIAL';

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() dueAmount?: number;
}
