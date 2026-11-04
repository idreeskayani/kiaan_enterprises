import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateShipmentDto } from '../shipments/dto.js';
import { AddCostDto, SaveDuesReportDto, UpdateCostPaymentDto, UpdateInvoiceStatusDto } from './dto.js';
import { InvoicesService } from './invoices.service.js';
import { DUES_SCOPES } from './dues-pdf.js';
import type { DuesScope } from './dues-pdf.js';

@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OPERATOR, Role.ACCOUNTANT)
export class InvoicesController {
  constructor(private invoices: InvoicesService) {}

  // Preview only: builds a PDF from the form data and saves nothing.
  @Post('preview')
  async preview(@Body() dto: CreateShipmentDto) {
    const { buffer, filename } = await this.invoices.preview(dto);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}"`,
    });
  }

  // An invoice on its own (no shipment, no quotation).
  @Post()
  createDirect(@Body() dto: CreateShipmentDto) {
    return this.invoices.createDirect(dto);
  }

  // The invoice of an existing shipment. Operators and accountants can create it.
  @Post('shipment/:shipmentId')
  create(@Param('shipmentId', ParseUUIDPipe) shipmentId: string) {
    return this.invoices.createForShipment(shipmentId);
  }

  // ?payment=PAID or ?payment=UNPAID (leave empty for all)
  // ?customer=<name> shows only that customer's invoices (partial, case-insensitive match)
  @Get('summary')
  summary() {
    return this.invoices.summary();
  }

  // Debits of every invoice (declared before ':id' routes). ?vendor=<name>&payment=PAID|UNPAID|PARTIAL
  @Get('costs')
  allCosts(@Query('vendor') vendor?: string, @Query('payment') payment?: string) {
    return this.invoices.listCosts(vendor, payment);
  }

  @Patch('costs/:costId/payment')
  setCostPayment(
    @Param('costId', ParseUUIDPipe) costId: string,
    @Body() dto: UpdateCostPaymentDto,
  ) {
    return this.invoices.setCostPayment(costId, dto.status, dto.dueAmount, dto);
  }

  // Proof picture of one payment (declared before ':id' routes)
  @Get('payments/:paymentId/image')
  paymentImage(@Param('paymentId', ParseUUIDPipe) paymentId: string) {
    return this.invoices.paymentImage(paymentId);
  }

  // ---- remaining dues statement of one customer (declared before ':id' routes)
  @Get('dues/:customerId/pdf')
  async duesPdf(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query('scope') scope?: string,
  ) {
    const { buffer, filename } = await this.invoices.duesPdf(customerId, DUES_SCOPES.includes(scope as DuesScope) ? (scope as DuesScope) : 'DUES');
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get('dues/:customerId/reports')
  duesReports(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.invoices.listDuesReports(customerId);
  }

  @Post('dues/:customerId/report')
  saveDuesReport(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: SaveDuesReportDto,
  ) {
    return this.invoices.saveDuesReport(customerId, dto.status, dto.scope);
  }

  @Patch('dues-reports/:reportId/sent')
  markDuesReportSent(@Param('reportId', ParseUUIDPipe) reportId: string) {
    return this.invoices.markDuesReportSent(reportId);
  }

  @Delete('dues-reports/:reportId')
  removeDuesReport(@Param('reportId', ParseUUIDPipe) reportId: string) {
    return this.invoices.removeDuesReport(reportId);
  }

  @Get('dues-reports/:reportId/pdf')
  async duesReportPdf(@Param('reportId', ParseUUIDPipe) reportId: string) {
    const { buffer, filename } = await this.invoices.duesReportPdf(reportId);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get()
  list(@Query('payment') payment?: string, @Query('customer') customer?: string) {
    return this.invoices.list(payment, customer);
  }

  @Get(':id/pdf')
  async pdf(@Param('id', ParseUUIDPipe) id: string) {
    const { buffer, filename } = await this.invoices.pdf(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.findOne(id);
  }

  // Change a standalone invoice (same form data as creating one).
  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateShipmentDto) {
    return this.invoices.update(id, dto);
  }

  // Costs (debit) of an invoice and the profit they leave.
  @Get(':id/costs')
  costs(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.costs(id);
  }

  @Post(':id/costs')
  addCost(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddCostDto) {
    return this.invoices.addCost(id, dto);
  }

  @Delete(':id/costs/:costId')
  removeCost(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('costId', ParseUUIDPipe) costId: string,
  ) {
    return this.invoices.removeCost(id, costId);
  }

  @Post(':id/issue')
  issue(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.issue(id);
  }

  @Patch(':id/status')
  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceStatusDto,
  ) {
    return this.invoices.updateStatus(id, dto.status, dto.dueAmount, dto);
  }

  @Delete(':id')
  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.remove(id);
  }
}