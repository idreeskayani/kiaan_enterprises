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
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateShipmentDto } from '../shipments/dto.js';
import { UpdateInvoiceStatusDto } from './dto.js';
import { InvoicesService } from './invoices.service.js';

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

  @Post(':id/issue')
  issue(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.issue(id);
  }

  @Patch(':id/status')
  @Roles(Role.ACCOUNTANT)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceStatusDto,
  ) {
    return this.invoices.updateStatus(id, dto.status, dto.dueAmount);
  }

  @Delete(':id')
  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.remove(id);
  }
}