import { Module } from '@nestjs/common';
import { ClearanceController } from './clearance.controller.js';
import { ClearanceService } from './clearance.service.js';
import { ClearanceReportsService } from './clearance-reports.service.js';

@Module({
  controllers: [ClearanceController],
  providers: [ClearanceService, ClearanceReportsService],
})
export class ClearanceModule {}