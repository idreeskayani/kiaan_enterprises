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
  UseGuards,
} from '@nestjs/common';
import { Role, ShipmentStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateShipmentDto, QuoteDto, UpdateStatusDto } from './dto.js';
import { ShipmentsService } from './shipments.service.js';

@Controller('shipments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OPERATOR, Role.ACCOUNTANT)
export class ShipmentsController {
  constructor(private shipments: ShipmentsService) {}

  @Post('quote')
  quote(@Body() dto: QuoteDto) {
    return this.shipments.quote(dto);
  }

  @Get('summary')
  summary() {
    return this.shipments.summary();
  }

  @Post()
  @Roles(Role.OPERATOR)
  create(@Body() dto: CreateShipmentDto, @Req() req: any) {
    return this.shipments.create(dto, req.user.id);
  }

  @Get()
  list(@Query('status') status?: ShipmentStatus) {
    return this.shipments.list(status);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.findOne(id);
  }

  @Get(':id/quote')
  quoteFor(@Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.quoteForShipment(id);
  }

  @Post(':id/book')
  @Roles(Role.OPERATOR)
  book(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.shipments.book(id, req.user.id);
  }

  @Delete(':id')
  @Roles(Role.OPERATOR)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.remove(id);
  }

  @Patch(':id/status')
  @Roles(Role.OPERATOR)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
    @Req() req: any,
  ) {
    return this.shipments.updateStatus(id, dto.status, dto.note, req.user.id);
  }
}