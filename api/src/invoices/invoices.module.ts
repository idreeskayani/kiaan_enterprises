import { Module } from '@nestjs/common';
import { ShipmentsModule } from '../shipments/shipments.module.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';

@Module({
  imports: [ShipmentsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
