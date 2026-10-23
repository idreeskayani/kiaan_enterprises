import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module.js';
import { ShipmentsController } from './shipments.controller.js';
import { ShipmentsService } from './shipments.service.js';

@Module({
  imports: [PricingModule],
  controllers: [ShipmentsController],
  providers: [ShipmentsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}