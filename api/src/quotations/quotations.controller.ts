import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { QuotationStatus, Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateShipmentDto } from '../shipments/dto.js';
import { CreateQuotationDto } from './dto.js';
import { QuotationsService } from './quotations.service.js';

const pdfFile = (buffer: Buffer, filename: string) =>
  new StreamableFile(buffer, {
    type: 'application/pdf',
    disposition: `inline; filename="${filename}"`,
  });

@Controller('quotations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OPERATOR, Role.ACCOUNTANT)
export class QuotationsController {
  constructor(private quotations: QuotationsService) {}

  // Preview only: builds the PDF from the form data and saves nothing.
  @Post('preview')
  async preview(@Body() dto: CreateShipmentDto) {
    const { buffer, filename } = await this.quotations.preview(dto);
    return pdfFile(buffer, filename);
  }

  // Saved as DRAFT. Use :id/send to mark it sent.
  @Post()
  @Roles(Role.OPERATOR)
  create(@Body() dto: CreateQuotationDto) {
    return this.quotations.create(dto);
  }

  @Get()
  list(@Query('status') status?: QuotationStatus) {
    return this.quotations.list(status);
  }

  @Get(':id/pdf')
  async pdf(@Param('id', ParseUUIDPipe) id: string) {
    const { buffer, filename } = await this.quotations.pdf(id);
    return pdfFile(buffer, filename);
  }

  @Get(':id/quote')
  breakdown(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.breakdown(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.findOne(id);
  }

  @Put(':id')
  @Roles(Role.OPERATOR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateQuotationDto) {
    return this.quotations.update(id, dto);
  }

  @Post(':id/send')
  @Roles(Role.OPERATOR)
  send(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.send(id);
  }

  @Post(':id/accept')
  @Roles(Role.OPERATOR)
  accept(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.quotations.accept(id, req.user.id);
  }

  @Post(':id/reject')
  @Roles(Role.OPERATOR)
  reject(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.reject(id);
  }

  @Delete(':id')
  @Roles(Role.OPERATOR)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.remove(id);
  }
}