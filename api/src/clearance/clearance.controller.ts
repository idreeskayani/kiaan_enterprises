import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ClearanceService } from './clearance.service.js';
import { CLEARANCE_SCOPES, ClearanceReportsService } from './clearance-reports.service.js';
import type { ClearanceScope } from './clearance-reports.service.js';
import {
  ClearancePaymentDto,
  ClearanceStatusDto,
  CreateClearanceDto,
  SaveClearanceReportDto,
  UpdateClearanceDto,
} from './dto.js';

@Controller('clearance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CLEARING_AGENT, Role.ACCOUNTANT)
export class ClearanceController {
  constructor(
    private clearance: ClearanceService,
    private reports: ClearanceReportsService,
  ) {}

  @Get('stats')
  stats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.clearance.stats(from, to);
  }

  // customer names for the search list of the invoices page
  @Get('customers')
  customers() {
    return this.clearance.customers();
  }

  // proof picture of one payment (loaded only when "View pic" is clicked)
  @Get('payments/:paymentId/image')
  paymentImage(@Param('paymentId', ParseUUIDPipe) paymentId: string) {
    return this.clearance.paymentImage(paymentId);
  }

  // ---- customer statements (same as the freight reports). Declared before the ':id' routes.
  @Get('reports/live')
  async livePdf(
    @Query('customer') customer = '',
    @Query('scope') scope?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { buffer, filename } = await this.reports.livePdf(
      customer,
      CLEARANCE_SCOPES.includes(scope as ClearanceScope) ? (scope as ClearanceScope) : 'ALL',
      from,
      to,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get('reports/drafts')
  reportDrafts(@Query('customer') customer = '') {
    return this.reports.listDrafts(customer);
  }

  @Post('reports')
  saveReport(@Body() dto: SaveClearanceReportDto) {
    return this.reports.save(dto.customer, dto.scope ?? 'ALL', dto.status, dto.from, dto.to);
  }

  @Patch('reports/:reportId/sent')
  reportSent(@Param('reportId', ParseUUIDPipe) reportId: string) {
    return this.reports.markSent(reportId);
  }

  @Delete('reports/:reportId')
  removeReport(@Param('reportId', ParseUUIDPipe) reportId: string) {
    return this.reports.remove(reportId);
  }

  @Get('reports/:reportId/pdf')
  async savedReportPdf(@Param('reportId', ParseUUIDPipe) reportId: string) {
    const { buffer, filename } = await this.reports.savedPdf(reportId);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get()
  list(
    @Query('status') status?: string,
    @Query('payment') payment?: string,
    @Query('q') q?: string,
    @Query('scope') scope?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.clearance.list(status, payment, q, scope, from, to);
  }

  @Post()
  @Roles(Role.CLEARING_AGENT)
  create(@Body() dto: CreateClearanceDto, @Req() req: any) {
    return this.clearance.create(dto, req.user.id);
  }

  @Get(':id/pdf')
  async pdf(@Param('id', ParseUUIDPipe) id: string) {
    const { buffer, filename } = await this.clearance.pdf(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clearance.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.CLEARING_AGENT)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClearanceDto) {
    return this.clearance.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.CLEARING_AGENT)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClearanceStatusDto,
    @Req() req: any,
  ) {
    return this.clearance.updateStatus(id, dto.status, dto.note, req.user.id);
  }

  @Post(':id/invoice')
  @Roles(Role.CLEARING_AGENT)
  generateInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.clearance.generateInvoice(id);
  }

  @Post(':id/draft')
  @Roles(Role.CLEARING_AGENT)
  saveDraft(@Param('id', ParseUUIDPipe) id: string) {
    return this.clearance.saveDraft(id);
  }

  @Post(':id/issue')
  @Roles(Role.CLEARING_AGENT)
  issue(@Param('id', ParseUUIDPipe) id: string) {
    return this.clearance.issue(id);
  }

  @Delete(':id/invoice')
  @Roles(Role.CLEARING_AGENT)
  removeInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.clearance.removeInvoice(id);
  }

  @Patch(':id/payment')
  @Roles(Role.CLEARING_AGENT, Role.ACCOUNTANT)
  setPayment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ClearancePaymentDto) {
    return this.clearance.setPayment(id, dto.status, dto.dueAmount, dto);
  }
}