import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { InvoiceStatus, Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { UpdateInvoiceStatusDto } from './dto.js';
import { InvoicesService } from './invoices.service.js';

@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoicesController {
  constructor(private invoices: InvoicesService) {}

  @Post('shipment/:shipmentId')
  @Roles(Role.ADMIN, Role.ACCOUNTANT)
  create(@Param('shipmentId', ParseUUIDPipe) shipmentId: string) {
    return this.invoices.createForShipment(shipmentId);
  }

  @Get()
  list(@Query('status') status?: InvoiceStatus) {
    return this.invoices.list(status);
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
}
