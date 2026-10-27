import {
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateCustomerDto,
  CreateHsCodeDto,
  CreateRateCardDto,
  UpdateRateCardDto,
} from './dto.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CatalogController {
  constructor(private prisma: PrismaService) {}

  private async unique<T>(fn: () => Promise<T>, message: string): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(message);
      }
      throw e;
    }
  }

  @Get('customers')
  customers() {
    return this.prisma.customer.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('customers')
  @Roles(Role.ADMIN, Role.OPERATOR, Role.ACCOUNTANT)
  createCustomer(@Body() dto: CreateCustomerDto) {
    return this.prisma.customer.create({ data: dto });
  }

  @Get('rate-cards')
  @Roles(Role.ADMIN, Role.OPERATOR, Role.ACCOUNTANT)
  rateCards() {
    return this.prisma.rateCard.findMany();
  }

  @Post('rate-cards')
  @Roles(Role.ADMIN,Role.OPERATOR)
  createRateCard(@Body() dto: CreateRateCardDto) {
    return this.unique(
      () => this.prisma.rateCard.create({ data: dto }),
      'A rate card for this mode, origin and destination already exists. Use PATCH /rate-cards/:id to change it.',
    );
  }

  @Patch('rate-cards/:id')
  @Roles(Role.ADMIN,Role.OPERATOR)
  updateRateCard(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRateCardDto,
  ) {
    return this.prisma.rateCard.update({ where: { id }, data: dto });
  }

  @Get('hs-codes')
  hsCodes() {
    return this.prisma.hsCode.findMany({ orderBy: { code: 'asc' } });
  }

  @Post('hs-codes')
  @Roles(Role.ADMIN,Role.OPERATOR, Role.CLEARING_AGENT)
  createHsCode(@Body() dto: CreateHsCodeDto) {
    return this.unique(
      () => this.prisma.hsCode.create({ data: dto }),
      'This HS code already exists.',
    );
  }
}