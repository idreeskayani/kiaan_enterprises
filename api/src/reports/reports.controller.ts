import { BadRequestException, Controller, Get, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { PERIODS, ReportsService } from './reports.service.js';
import type { Period, Section } from './reports.service.js';

// Daily / weekly / monthly / yearly figures. Freight and clearance each have their own staff.
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private reports: ReportsService) {}

  private period(v?: string): Period {
    if (!PERIODS.includes(v as Period)) throw new BadRequestException('period must be day, week, month or year');
    return v as Period;
  }

  private file(f: { buffer: Buffer; filename: string }, type: string, disposition: 'inline' | 'attachment') {
    return new StreamableFile(f.buffer, { type, disposition: `${disposition}; filename="${f.filename}"` });
  }

  // ---- freight
  @Get('freight')
  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  freight(@Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('customer') customer?: string) {
    return this.reports.report('freight', this.period(period), from, to, customer);
  }

  @Get('freight/pdf')
  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  async freightPdf(@Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('customer') customer?: string) {
    return this.file(await this.reports.pdf('freight', this.period(period), from, to, customer), 'application/pdf', 'inline');
  }

  @Get('freight/csv')
  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  async freightCsv(@Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('customer') customer?: string) {
    return this.file(await this.reports.csv('freight', this.period(period), from, to, customer), 'text/csv; charset=utf-8', 'attachment');
  }

  // ---- clearance
  @Get('clearance')
  @Roles(Role.CLEARING_AGENT, Role.ACCOUNTANT)
  clearance(@Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('customer') customer?: string) {
    return this.reports.report('clearance', this.period(period), from, to, customer);
  }

  @Get('clearance/pdf')
  @Roles(Role.CLEARING_AGENT, Role.ACCOUNTANT)
  async clearancePdf(@Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('customer') customer?: string) {
    return this.file(await this.reports.pdf('clearance', this.period(period), from, to, customer), 'application/pdf', 'inline');
  }

  @Get('clearance/csv')
  @Roles(Role.CLEARING_AGENT, Role.ACCOUNTANT)
  async clearanceCsv(@Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('customer') customer?: string) {
    return this.file(await this.reports.csv('clearance', this.period(period), from, to, customer), 'text/csv; charset=utf-8', 'attachment');
  }
}

export type { Section };
