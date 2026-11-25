import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InvoiceStatus, Prisma, Role } from '@prisma/client';
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

  // Same customer typed with different case / extra spaces counts as the same name.
  private async assertCustomerNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.customer.findFirst({
      where: {
        name: { equals: name.replace(/\s+/g, ' ').trim(), mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException('A customer with this name already exists');
  }

  // An invoice belongs to a customer directly (standalone) or through its shipment.
  private invoiceWhere(id: string): Prisma.InvoiceWhereInput {
    return { OR: [{ customerId: id }, { shipment: { customerId: id } }] };
  }

  // Customers page: every customer with how many records they have.
  @Get('customers/summary')
  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  async customersSummary() {
    const [customers, quotations, shipments, invoices] = await Promise.all([
      this.prisma.customer.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.quotation.groupBy({ by: ['customerId'], _count: { _all: true } }),
      this.prisma.shipment.groupBy({ by: ['customerId'], _count: { _all: true } }),
      this.prisma.invoice.findMany({
        select: {
          customerId: true,
          status: true,
          total: true,
          dueAmount: true,
          shipment: { select: { customerId: true } },
        },
      }),
    ]);
    const q = new Map(quotations.map((r) => [r.customerId, r._count._all]));
    const sh = new Map(shipments.map((r) => [r.customerId, r._count._all]));
    const inv = new Map<string, { count: number; invoiced: number; outstanding: number }>();
    for (const i of invoices) {
      const cid = i.customerId ?? i.shipment?.customerId;
      if (!cid) continue;
      const row = inv.get(cid) ?? { count: 0, invoiced: 0, outstanding: 0 };
      row.count += 1;
      if (i.status === InvoiceStatus.ISSUED || i.status === InvoiceStatus.PAID) {
        row.invoiced += Number(i.total);
      }
      if (i.status === InvoiceStatus.ISSUED) {
        row.outstanding += Number(i.dueAmount) > 0 ? Number(i.dueAmount) : Number(i.total);
      }
      inv.set(cid, row);
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    return customers.map((c) => ({
      ...c,
      quotations: q.get(c.id) ?? 0,
      shipments: sh.get(c.id) ?? 0,
      invoices: inv.get(c.id)?.count ?? 0,
      invoiced: round(inv.get(c.id)?.invoiced ?? 0),
      outstanding: round(inv.get(c.id)?.outstanding ?? 0),
    }));
  }

  // All quotations, shipments and invoices of one customer.
  @Get('customers/:id/details')
  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  async customerDetails(@Param('id', ParseUUIDPipe) id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    const [quotations, shipments, invoices] = await Promise.all([
      this.prisma.quotation.findMany({
        where: { customerId: id },
        select: { id: true, quoteNo: true, status: true, total: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.shipment.findMany({
        where: { customerId: id },
        select: {
          id: true, refNo: true, status: true, mode: true, origin: true, destination: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.findMany({
        where: this.invoiceWhere(id),
        select: { id: true, invoiceNo: true, status: true, total: true, dueAmount: true, issuedAt: true },
        orderBy: { issuedAt: 'desc' },
      }),
    ]);
    return { customer, quotations, shipments, invoices };
  }

  // Only a customer with no quotations, shipments or invoices can be deleted.
  @Delete('customers/:id')
  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  async deleteCustomer(@Param('id', ParseUUIDPipe) id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    const [quotations, shipments, invoices] = await Promise.all([
      this.prisma.quotation.count({ where: { customerId: id } }),
      this.prisma.shipment.count({ where: { customerId: id } }),
      this.prisma.invoice.count({ where: this.invoiceWhere(id) }),
    ]);
    if (quotations || shipments || invoices) {
      throw new ConflictException(
        `${customer.name} cannot be deleted: it has ${quotations} quotation(s), ${shipments} shipment(s) and ${invoices} invoice(s).`,
      );
    }
    await this.prisma.customer.delete({ where: { id } });
    return { deleted: true };
  }

  @Get('customers')
  customers() {
    return this.prisma.customer.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('customers')
  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  async createCustomer(@Body() dto: CreateCustomerDto) {
    const name = dto.name?.replace(/\s+/g, ' ').trim();
    if (!name) throw new BadRequestException('Enter the customer name');
    await this.assertCustomerNameFree(name);
    return this.prisma.customer.create({
      data: {
        name,
        phone: dto.phone?.trim() || null,
        address: dto.address?.trim() || null,
        taxNumber: dto.taxNumber?.trim() || null,
      },
    });
  }

  // Empty text clears a detail (phone / address / tax number). The name cannot be emptied.
  @Patch('customers/:id')
  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  async updateCustomer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto) {
    const name = dto.name?.replace(/\s+/g, ' ').trim();
    if (dto.name !== undefined && !name) throw new BadRequestException('Enter the customer name');
    if (name) await this.assertCustomerNameFree(name, id);
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