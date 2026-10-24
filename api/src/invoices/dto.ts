import { IsIn } from 'class-validator';

export class UpdateInvoiceStatusDto {
  @IsIn(['PAID', 'UNPAID']) status: 'PAID' | 'UNPAID';
}