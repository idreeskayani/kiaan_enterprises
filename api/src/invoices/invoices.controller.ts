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

  @Post('shipment/:shipmentId')
  @Roles(Role.ADMIN, Role.ACCOUNTANT)
  create(@Param('shipmentId', ParseUUIDPipe) shipmentId: string) {
    return this.invoices.createForShipment(shipmentId);
  }

  // ?payment=PAID or ?payment=UNPAID (leave empty for all)
  @Get()
  list(@Query('payment') payment?: string) {
    return this.invoices.list(payment);
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

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.ACCOUNTANT)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceStatusDto,
  ) {
    return this.invoices.updateStatus(id, dto.status);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.ACCOUNTANT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.remove(id);
  }
}