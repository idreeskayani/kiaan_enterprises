import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClearancePayment,
  ClearanceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateClearanceDto, UpdateClearanceDto } from './dto.js';
import { buildClearancePdf } from './clearance.pdf.js';
import { CHARGE_CODES, DETAIL_KEYS } from './charges.js';

type Line = { code: string; label: string; amount: number };


const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class ClearanceService {
  constructor(private prisma: PrismaService) {}

  private cleanDetails(d?: Record<string, unknown> | null) {
    const out: Record<string, string> = {};
    for (const k of DETAIL_KEYS) {
      const v = d?.[k];
      if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 200);
    }
    return out;
  }

  // Only the charges that were filled in; printed in the bill's own order.
  private build(charges: { code: string; amount: number }[]) {
    const lines: Line[] = [];
    for (const c of CHARGE_CODES) {
      const hit = charges.find((x) => x.code === c.code);
      if (hit && hit.amount > 0) lines.push({ code: c.code, label: c.label, amount: r2(hit.amount) });
    }
    return { lines, total: r2(lines.reduce((s, l) => s + l.amount, 0)) };
  }

  private async nextJobNo() {
    const prefix = `CJ-${new Date().getFullYear()}-`;
    const last = await this.prisma.clearanceJob.findFirst({
      where: { jobNo: { startsWith: prefix } },
      orderBy: { jobNo: 'desc' },
      select: { jobNo: true },
    });
    const n = last ? Number(last.jobNo.slice(prefix.length)) || 0 : 0;
    return `${prefix}${String(n + 1).padStart(5, '0')}`;
  }

  private async nextInvoiceNo() {
    const prefix = `TNI-${new Date().getFullYear()}-`;
    const last = await this.prisma.clearanceJob.findFirst({
      where: { invoiceNo: { startsWith: prefix } },
      orderBy: { invoiceNo: 'desc' },
      select: { invoiceNo: true },
    });
    const n = last?.invoiceNo ? Number(last.invoiceNo.slice(prefix.length)) || 0 : 0;
    return `${prefix}${String(n + 1).padStart(5, '0')}`;
  }

  async create(dto: CreateClearanceDto, userId: string) {
    if (!dto.customerName?.trim()) throw new BadRequestException('Enter the customer name');
    const job = await this.prisma.clearanceJob.create({
      data: {
        customerName: dto.customerName.trim(),
        customerAddress: dto.customerAddress?.trim() || null,
        customerPhone: dto.customerPhone?.trim() || null,
        customerTax: dto.customerTax?.trim() || null,
        jobNo: await this.nextJobNo(),
        history: { create: { status: ClearanceStatus.PENDING, note: 'Job opened', userId } },
      },
    });
    return this.findOne(job.id);
  }

  // scope: ongoing | ready (released, not invoiced) | completed (released) | invoiced | all
  list(status?: string, payment?: string, q?: string, scope?: string) {
    const where: Prisma.ClearanceJobWhereInput = {};
    if (scope === 'ongoing') {
      where.status = { notIn: [ClearanceStatus.RELEASED, ClearanceStatus.CANCELLED] };
    } else if (scope === 'completed') {
      where.status = ClearanceStatus.RELEASED;
    } else if (scope === 'ready') {
      where.status = ClearanceStatus.RELEASED;
      where.payment = ClearancePayment.UNINVOICED;
    } else if (scope === 'invoiced') {
      where.invoiceNo = { not: null };
    }
    if (status && status in ClearanceStatus) where.status = status as ClearanceStatus;
    if (payment && payment in ClearancePayment) where.payment = payment as ClearancePayment;
    const t = q?.trim();
    if (t) {
      const c = { contains: t, mode: 'insensitive' as const };
      where.OR = [
        { jobNo: c },
        { gdNo: c },
        { invoiceNo: c },
        { customerName: c },
      ];
    }
    return this.prisma.clearanceJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const job = await this.prisma.clearanceJob.findUnique({
      where: { id },
      include: {
        hsCode: true,
        history: { orderBy: { at: 'asc' }, include: { user: { select: { email: true } } } },
      },
    });
    if (!job) throw new NotFoundException('Clearance job not found');
    return job;
  }

  async update(id: string, dto: UpdateClearanceDto) {
    const job = await this.findOne(id);
    if (job.invoiceNo) {
      throw new ConflictException('Invoice already generated. Delete the invoice before editing.');
    }
    const av = dto.assessableValue ?? Number(job.assessableValue);
    const existing = (job.lines as unknown as Line[]).map((l) => ({ code: l.code, amount: l.amount }));
    const { lines, total } = this.build(dto.charges ?? existing);
    const text = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);

    await this.prisma.clearanceJob.update({
      where: { id },
      data: {
        customerName: dto.customerName?.trim() || undefined,
        customerAddress: text(dto.customerAddress),
        customerPhone: text(dto.customerPhone),
        customerTax: text(dto.customerTax),
        details: dto.details
          ? (this.cleanDetails(dto.details) as Prisma.InputJsonValue)
          : undefined,
        assessableValue: av,
        gdNo: text(dto.gdNo),
        lines: lines as unknown as Prisma.InputJsonValue,
        total,
      },
    });
    return this.findOne(id);
  }

  async updateStatus(id: string, status: ClearanceStatus, note: string | undefined, userId: string) {
    await this.findOne(id);
    await this.prisma.$transaction([
      this.prisma.clearanceJob.update({ where: { id }, data: { status } }),
      this.prisma.clearanceHistory.create({ data: { jobId: id, status, note, userId } }),
    ]);
    return this.findOne(id);
  }

  async generateInvoice(id: string) {
    const job = await this.findOne(id);
    if (job.invoiceNo) throw new ConflictException('Invoice already exists for this job');
    if (job.status === ClearanceStatus.CANCELLED) {
      throw new ConflictException('Cannot invoice a cancelled job');
    }
    if (!(Number(job.total) > 0)) {
      throw new BadRequestException(
        'Add at least one charge before invoicing',
      );
    }
    await this.prisma.clearanceJob.update({
      where: { id },
      data: {
        invoiceNo: await this.nextInvoiceNo(),
        invoicedAt: new Date(),
        payment: ClearancePayment.UNPAID,
        dueAmount: 0,
      },
    });
    return this.findOne(id);
  }

  async removeInvoice(id: string) {
    const job = await this.findOne(id);
    if (!job.invoiceNo) throw new BadRequestException('This job has no invoice');
    await this.prisma.clearanceJob.update({
      where: { id },
      data: { invoiceNo: null, invoicedAt: null, payment: ClearancePayment.UNINVOICED, dueAmount: 0 },
    });
    return this.findOne(id);
  }

  async setPayment(id: string, status: 'PAID' | 'UNPAID' | 'PARTIAL', dueAmount?: number) {
    const job = await this.findOne(id);
    if (!job.invoiceNo) throw new BadRequestException('Generate the invoice first');
    if (status === 'PARTIAL') {
      if (dueAmount == null) throw new BadRequestException('Enter the remaining dues amount');
      if (dueAmount >= Number(job.total)) {
        throw new BadRequestException(
          'Remaining dues must be less than the invoice total. Use "Unpaid" if nothing has been paid.',
        );
      }
      await this.prisma.clearanceJob.update({
        where: { id },
        data: { payment: ClearancePayment.PARTIAL, dueAmount },
      });
    } else {
      await this.prisma.clearanceJob.update({
        where: { id },
        data: {
          payment: status === 'PAID' ? ClearancePayment.PAID : ClearancePayment.UNPAID,
          dueAmount: 0,
        },
      });
    }
    return this.findOne(id);
  }

  async pdf(id: string) {
    const job = await this.findOne(id);
    if (!job.invoiceNo) throw new BadRequestException('Generate the invoice first');
    const buffer = await buildClearancePdf({
      jobNo: job.jobNo,
      invoiceNo: job.invoiceNo,
      payment: job.payment,
      invoicedAt: job.invoicedAt ?? new Date(),
      total: job.total,
      gdNo: job.gdNo,
      assessableValue: job.assessableValue,
      customerName: job.customerName,
      customerAddress: job.customerAddress,
      customerPhone: job.customerPhone,
      customerTax: job.customerTax,
      details: job.details,
      lines: (job.lines as unknown as Line[]).map((l) => ({ code: l.code, amount: l.amount })),
    });
    return { buffer, filename: `${job.invoiceNo}.pdf` };
  }

  async stats() {
    const all = await this.prisma.clearanceJob.findMany({
      select: { status: true, payment: true, total: true, dueAmount: true },
    });
    const byStatus: Record<string, number> = {};
    for (const j of all) byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;

    const live = all.filter((j) => j.status !== ClearanceStatus.CANCELLED);
    const invoiced = live.filter((j) => j.payment !== ClearancePayment.UNINVOICED);
    const count = (p: ClearancePayment) => invoiced.filter((j) => j.payment === p).length;
    const outstanding = invoiced.reduce(
      (s, j) =>
        s +
        (j.payment === ClearancePayment.UNPAID
          ? Number(j.total)
          : j.payment === ClearancePayment.PARTIAL
            ? Number(j.dueAmount)
            : 0),
      0,
    );
    const invoicedAmount = invoiced.reduce((s, j) => s + Number(j.total), 0);

    return {
      jobs: live.length,
      inProgress: live.filter((j) => j.status !== ClearanceStatus.RELEASED).length,
      released: live.filter((j) => j.status === ClearanceStatus.RELEASED).length,
      readyToInvoice: live.filter(
        (j) => j.status === ClearanceStatus.RELEASED && j.payment === ClearancePayment.UNINVOICED,
      ).length,
      byStatus,
      invoices: {
        notInvoiced: live.length - invoiced.length,
        issued: invoiced.length,
        paid: count(ClearancePayment.PAID),
        unpaid: count(ClearancePayment.UNPAID),
        partial: count(ClearancePayment.PARTIAL),
      },
      amounts: {
        invoiced: r2(invoicedAmount),
        collected: r2(invoicedAmount - outstanding),
        outstanding: r2(outstanding),
      },
    };
  }
}