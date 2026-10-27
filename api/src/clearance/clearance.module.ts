import { Module } from '@nestjs/common';
import { ClearanceController } from './clearance.controller.js';
import { ClearanceService } from './clearance.service.js';

@Module({
  controllers: [ClearanceController],
  providers: [ClearanceService],
})
export class ClearanceModule {}