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
import {
  ClearancePaymentDto,
  ClearanceStatusDto,
  CreateClearanceDto,
  UpdateClearanceDto,
} from './dto.js';

@Controller('clearance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CLEARING_AGENT, Role.ACCOUNTANT)
export class ClearanceController {
  constructor(private clearance: ClearanceService) {}

  @Get('stats')
  stats() {
    return this.clearance.stats();
  }

  @Get()
  list(
    @Query('status') status?: string,
    @Query('payment') payment?: string,
    @Query('q') q?: string,
    @Query('scope') scope?: string,
  ) {
    return this.clearance.list(status, payment, q, scope);
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

  @Delete(':id/invoice')
  @Roles(Role.CLEARING_AGENT)
  removeInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.clearance.removeInvoice(id);
  }

  @Patch(':id/payment')
  @Roles(Role.CLEARING_AGENT, Role.ACCOUNTANT)
  setPayment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ClearancePaymentDto) {
    return this.clearance.setPayment(id, dto.status, dto.dueAmount);
  }
}