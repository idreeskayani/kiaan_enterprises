import { Module } from '@nestjs/common';
import { ClearanceController } from './clearance.controller.js';
import { ClearanceService } from './clearance.service.js';
import { ClearanceCustomersService } from './clearance-customers.js';
import { ClearanceReportsService } from './clearance-reports.service.js';

@Module({
  controllers: [ClearanceController],
  providers: [ClearanceService, ClearanceReportsService, ClearanceCustomersService],
})
export class ClearanceModule {}