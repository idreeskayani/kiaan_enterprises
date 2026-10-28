import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CreateShipmentDto } from '../shipments/dto.js';

// Same fields as a shipment, plus how long the offer stays valid.
export class CreateQuotationDto extends CreateShipmentDto {
  @IsOptional() @IsInt() @Min(1) @Max(90) validDays?: number;
}