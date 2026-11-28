import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ClearancePayment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

// "KR  International" and "kr international" are the same customer.
export const cleanName = (n: string) => n.replace(/\s+/g, ' ').trim();
export const sameName = (a: string, b: string) => cleanName(a).toLowerCase() === cleanName(b).toLowerCase();

type Details = { phone?: string | null; address?: string | null; taxNumber?: string | null };

// Used when a clearance job is opened or its customer is changed: a name that already exists
// (any capitals / spacing) reuses the saved customer, a new name saves a new one. Never a duplicate.
export async function resolveClearanceCustomer(prisma: PrismaService, rawName: string, details: Details = {}) {
  const name = cleanName(rawName);
  const found = await prisma.clearanceCustomer.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });
  if (found) return found.name;
  const created = await prisma.clearanceCustomer.create({
    data: {
      name,
      phone: details.phone?.trim() || null,
      address: details.address?.trim() || null,
      taxNumber: details.taxNumber?.trim() || null,
    },
  });
  return created.name;
}

@Injectable()
export class ClearanceCustomersService {
  constructor(private prisma: PrismaService) {}

  private async jobsOf(name: string) {
    const jobs = await this.prisma.clearanceJob.findMany({
      select: {
        id: true,
        jobNo: true,
        customerName: true,
        status: true,
        invoiceNo: true,
        invoicedAt: true,
        payment: true,
        total: true,
        dueAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return jobs.filter((j) => sameName(j.customerName, name));
  }

  private remaining(j: { payment: ClearancePayment | null; total: unknown; dueAmount: unknown }) {
    if (j.payment === ClearancePayment.UNPAID) return Number(j.total);
    if (j.payment === ClearancePayment.PARTIAL) return Number(j.dueAmount);
    return 0;
  }

  private async assertFree(name: string, exceptId?: string) {
    const clash = await this.prisma.clearanceCustomer.findFirst({
      where: {
        name: { equals: cleanName(name), mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException('A customer with this name already exists');
  }

  async summary() {
    const [customers, jobs] = await Promise.all([
      this.prisma.clearanceCustomer.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.clearanceJob.findMany({
        select: { customerName: true, invoiceNo: true, payment: true, total: true, dueAmount: true },
      }),
    ]);
    const key = (n: string) => cleanName(n).toLowerCase();
    const stats = new Map<string, { jobs: number; invoices: number; invoiced: number; outstanding: number }>();
    for (const j of jobs) {
      const row = stats.get(key(j.customerName)) ?? { jobs: 0, invoices: 0, invoiced: 0, outstanding: 0 };
      row.jobs += 1;
      if (j.invoiceNo && j.payment && j.payment !== ClearancePayment.DRAFT) {
        row.invoices += 1;
        row.invoiced += Number(j.total);
        row.outstanding += this.remaining(j);
      }
      stats.set(key(j.customerName), row);
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    return customers.map((c) => {
      const s = stats.get(key(c.name));
      return {
        ...c,
        jobs: s?.jobs ?? 0,
        invoices: s?.invoices ?? 0,
        invoiced: round(s?.invoiced ?? 0),
        outstanding: round(s?.outstanding ?? 0),
      };
    });
  }

  async details(id: string) {
    const customer = await this.prisma.clearanceCustomer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    const jobs = (await this.jobsOf(customer.name)).map((j) => ({
      id: j.id,
      jobNo: j.jobNo,
      status: j.status,
      createdAt: j.createdAt,
      invoiceNo: j.invoiceNo,
      invoicedAt: j.invoicedAt,
      payment: j.payment,
      total: j.total,
      remaining: this.remaining(j),
    }));
    return { customer, jobs };
  }

  async create(dto: { name: string; phone?: string; address?: string; taxNumber?: string }) {
    const name = cleanName(dto.name ?? '');
    if (!name) throw new BadRequestException('Enter the customer name');
    await this.assertFree(name);
    return this.prisma.clearanceCustomer.create({
      data: {
        name,
        phone: dto.phone?.trim() || null,
        address: dto.address?.trim() || null,
        taxNumber: dto.taxNumber?.trim() || null,
      },
    });
  }

  // Renaming also renames the customer on every job and statement of that name.
  async update(id: string, dto: { name?: string; phone?: string; address?: string; taxNumber?: string }) {
    const customer = await this.prisma.clearanceCustomer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    const name = dto.name === undefined ? undefined : cleanName(dto.name);
    if (dto.name !== undefined && !name) throw new BadRequestException('Enter the customer name');
    if (name) await this.assertFree(name, id);
    const renamed = name && name !== customer.name;
    const jobIds = renamed ? (await this.jobsOf(customer.name)).map((j) => j.id) : [];
    const reports = renamed
      ? (await this.prisma.clearanceReport.findMany({ select: { id: true, customerName: true } }))
          .filter((r) => sameName(r.customerName, customer.name))
          .map((r) => r.id)
      : [];
    const [updated] = await this.prisma.$transaction([
      this.prisma.clearanceCustomer.update({
        where: { id },
        data: {
          ...(name ? { name } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
          ...(dto.address !== undefined ? { address: dto.address.trim() || null } : {}),
          ...(dto.taxNumber !== undefined ? { taxNumber: dto.taxNumber.trim() || null } : {}),
        },
      }),
      ...(renamed
        ? [
            this.prisma.clearanceJob.updateMany({ where: { id: { in: jobIds } }, data: { customerName: name } }),
            this.prisma.clearanceReport.updateMany({ where: { id: { in: reports } }, data: { customerName: name } }),
          ]
        : []),
    ]);
    return updated;
  }

  // Only a customer with no jobs / invoices can be deleted.
  async remove(id: string) {
    const customer = await this.prisma.clearanceCustomer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    const jobs = await this.jobsOf(customer.name);
    if (jobs.length) {
      throw new ConflictException(
        `${customer.name} cannot be deleted: it has ${jobs.length} job(s)/invoice(s).`,
      );
    }
    await this.prisma.clearanceCustomer.delete({ where: { id } });
    return { deleted: true };
  }
}