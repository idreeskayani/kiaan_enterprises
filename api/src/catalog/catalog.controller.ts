import {
  BadRequestException,
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
  CreateVendorDto,
  UpdateCustomerDto,
  UpdateRateCardDto,
  UpdateVendorDto,
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
  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  createCustomer(@Body() dto: CreateCustomerDto) {
    return this.prisma.customer.create({ data: dto });
  }

  // Empty text clears a detail (phone / address / tax number). The name cannot be emptied.
  @Patch('customers/:id')
  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  updateCustomer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto) {
    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) throw new BadRequestException('Enter the customer name');
    return this.prisma.customer.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address.trim() || null } : {}),
        ...(dto.taxNumber !== undefined ? { taxNumber: dto.taxNumber.trim() || null } : {}),
      },
    });
  }

  @Get('vendors')
  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  vendors() {
    return this.prisma.vendor.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('vendors')
  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  createVendor(@Body() dto: CreateVendorDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Enter the vendor name');
    return this.unique(
      () =>
        this.prisma.vendor.create({
          data: {
            name,
            phone: dto.phone?.trim() || null,
            address: dto.address?.trim() || null,
            taxNumber: dto.taxNumber?.trim() || null,
          },
        }),
      'A vendor with this name already exists',
    );
  }

  @Patch('vendors/:id')
  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  updateVendor(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVendorDto) {
    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) throw new BadRequestException('Enter the vendor name');
    return this.unique(
      () =>
        this.prisma.vendor.update({
          where: { id },
          data: {
            ...(name ? { name } : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
            ...(dto.address !== undefined ? { address: dto.address.trim() || null } : {}),
            ...(dto.taxNumber !== undefined ? { taxNumber: dto.taxNumber.trim() || null } : {}),
          },
        }),
      'A vendor with this name already exists',
    );
  }

  @Get('rate-cards')
  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  rateCards() {
    return this.prisma.rateCard.findMany();
  }

  @Post('rate-cards')
  @Roles(Role.OPERATOR)
  createRateCard(@Body() dto: CreateRateCardDto) {
    return this.unique(
      () => this.prisma.rateCard.create({ data: dto }),
      'A rate card for this mode, origin and destination already exists. Use PATCH /rate-cards/:id to change it.',
    );
  }

  @Patch('rate-cards/:id')
  @Roles(Role.OPERATOR)
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
  @Roles(Role.OPERATOR, Role.CLEARING_AGENT)
  createHsCode(@Body() dto: CreateHsCodeDto) {
    return this.unique(
      () => this.prisma.hsCode.create({ data: dto }),
      'This HS code already exists.',
    );
  }
}