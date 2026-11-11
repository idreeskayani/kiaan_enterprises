import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClearancePayment,
  ClearanceStatus,
  PaymentDirection,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { dayRange, inDayRange } from '../common/date-range.js';
import { CreateClearanceDto, UpdateClearanceDto } from './dto.js';
import { PaymentInfoDto } from '../invoices/dto.js';
import { buildClearancePdf } from './clearance.pdf.js';
import {
  BILTY_CHARGE_CODE,
  CHARGE_CODES,
  DETAIL_KEYS,
  DUTY_CHARGE_CODE,
  DUTY_KEYS,
  NOC_CHARGE_CODE,
  NOC_TYPES,
} from './charges.js';

type Line = { code: string; label: string; amount: number };
type Noc = { type: string; amount: number };
type Bilty = { origin: string; destination: string; rent: number };


const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class ClearanceService {
  constructor(private prisma: PrismaService) {}

  // The latest payment shown in the lists (the picture itself is loaded only on request).
  private static readonly lastPaymentSelect = {
    orderBy: { paidAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      direction: true,
      method: true,
      reference: true,
      amount: true,
      hasImage: true,
      paidAt: true,
    },
  };

  // A cheque needs its number. Cash and online transfer need nothing more.
  private checkPaymentInfo(pay?: PaymentInfoDto) {
    if (pay?.method === 'CHEQUE' && !pay.reference?.trim()) {
      throw new BadRequestException('Enter the cheque number');
    }
  }

  // Payment row for money that just came in. Nothing is saved when no method was sent or nothing was paid.
  private paymentRow(
    jobId: string,
    amount: number,
    pay?: PaymentInfoDto,
  ): Prisma.PaymentCreateManyInput | null {
    if (!pay?.method || !(amount > 0)) return null;
    return {
      direction: PaymentDirection.CREDIT,
      method: pay.method as PaymentMethod,
      reference: pay.reference?.trim() || null,
      amount: r2(amount),
      hasImage: !!pay.image,
      imageData: pay.image ?? null,
      clearanceJobId: jobId,
    };
  }

  // The proof picture of one payment (a data URL), or null.
  async paymentImage(paymentId: string) {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { imageData: true },
    });
    if (!p) throw new NotFoundException('Payment not found');
    return { image: p.imageData };
  }

  // Customer names that have an invoice (for the search list on the invoices page).
  async customers() {
    const rows = await this.prisma.clearanceJob.groupBy({
      by: ['customerName'],
      where: { invoiceNo: { not: null } },
      orderBy: { customerName: 'asc' },
    });
    return rows.map((r) => r.customerName);
  }

  private cleanDetails(d?: Record<string, unknown> | null) {
    const out: Record<string, string> = {};
    for (const k of DETAIL_KEYS) {
      const v = d?.[k];
      if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 200);
    }
    return out;
  }

  // Keep only the known duty heads as non-negative whole rupees.
  private cleanDuties(d?: Record<string, unknown> | null) {
    const out: Record<string, number> = {};
    for (const { key } of DUTY_KEYS) {
      const n = Number(d?.[key]);
      if (Number.isFinite(n) && n > 0) out[key] = Math.round(n);
    }
    return out;
  }

  // Container numbers: trimmed, upper case, no duplicates.
  private cleanContainers(v: unknown) {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const x of v) {
      const c = typeof x === 'string' ? x.trim().toUpperCase().slice(0, 25) : '';
      if (c && !out.includes(c)) out.push(c);
    }
    return out.slice(0, 40);
  }

  // Only the known NOC types, each once, with a non-negative amount.
  private cleanNocs(v: unknown): Noc[] {
    if (!Array.isArray(v)) return [];
    const out: Noc[] = [];
    for (const x of v as { type?: unknown; amount?: unknown }[]) {
      const type = typeof x?.type === 'string' ? x.type.trim().toUpperCase() : '';
      if (!(NOC_TYPES as readonly string[]).includes(type) || out.some((n) => n.type === type)) continue;
      const amount = Number(x.amount);
      out.push({ type, amount: Number.isFinite(amount) && amount > 0 ? r2(amount) : 0 });
    }
    return out;
  }

  private cleanBilty(v: unknown): Bilty | null {
    const b = v as { origin?: unknown; destination?: unknown; rent?: unknown } | null;
    const origin = typeof b?.origin === 'string' ? b.origin.trim().slice(0, 80) : '';
    const destination = typeof b?.destination === 'string' ? b.destination.trim().slice(0, 80) : '';
    if (!origin || !destination) return null;
    const rent = Number(b?.rent);
    return { origin, destination, rent: Number.isFinite(rent) && rent > 0 ? r2(rent) : 0 };
  }

  // Only the charges that were filled in; printed in the bill's own order.
  // NOC charges (one per NOC) and the bilty rent are added just before the agency commission.
  // When the client paid the duties through PSID, that line is printed but not counted in the total.
  private build(
    charges: { code: string; amount: number }[],
    extra: { psid: boolean; nocs: Noc[]; bilty: Bilty | null },
  ) {
    const dynamic: Line[] = [];
    for (const n of extra.nocs) {
      if (n.amount > 0) dynamic.push({ code: NOC_CHARGE_CODE, label: `NOC Charges - ${n.type}`, amount: n.amount });
    }
    if (extra.bilty && extra.bilty.rent > 0) {
      dynamic.push({
        code: BILTY_CHARGE_CODE,
        label: `Bilty Transport - ${extra.bilty.origin} to ${extra.bilty.destination}`,
        amount: extra.bilty.rent,
      });
    }
    const lines: Line[] = [];
    for (const c of CHARGE_CODES) {
      if (c.code === '301') lines.push(...dynamic);
      const hit = charges.find((x) => x.code === c.code);
      if (hit && hit.amount > 0) lines.push({ code: c.code, label: c.label, amount: r2(hit.amount) });
    }
    const counted = lines.filter((l) => !(extra.psid && l.code === DUTY_CHARGE_CODE));
    return { lines, total: r2(counted.reduce((s, l) => s + l.amount, 0)) };
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
  // from/to: the job's created date; on the invoices view (scope=invoiced) the invoice date
  async list(status?: string, payment?: string, q?: string, scope?: string, from?: string, to?: string) {
    const where: Prisma.ClearanceJobWhereInput = {};
    const range = dayRange(from, to);
    if (range) {
      if (scope === 'invoiced') {
        // invoice date; a draft that was never sent has none yet, so its created date counts
        where.AND = [{ OR: [{ invoicedAt: range }, { invoicedAt: null, createdAt: range }] }];
      } else {
        where.createdAt = range;
      }
    }
    if (scope === 'ongoing') {
      where.status = { notIn: [ClearanceStatus.RELEASED, ClearanceStatus.CANCELLED] };
    } else if (scope === 'completed') {
      where.status = ClearanceStatus.RELEASED;
    } else if (scope === 'ready') {
      where.status = ClearanceStatus.RELEASED;
      where.payment = null; // released but no invoice yet
    } else if (scope === 'invoiced') {
      where.invoiceNo = { not: null };
      where.payment = { not: null };
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
    const rows = await this.prisma.clearanceJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { payments: ClearanceService.lastPaymentSelect },
    });
    return rows.map(({ payments, ...r }) => ({ ...r, lastPayment: payments[0] ?? null }));
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
    // a draft or an unpaid invoice can still be edited; once money is recorded (partly or fully paid) it is locked
    if (
      job.invoiceNo &&
      job.payment !== ClearancePayment.DRAFT &&
      job.payment !== ClearancePayment.UNPAID
    ) {
      throw new ConflictException(
        job.payment === ClearancePayment.PAID
          ? 'A paid invoice cannot be edited. Mark it unpaid first.'
          : 'This invoice has a payment recorded, so it cannot be edited.',
      );
    }
    const av = dto.assessableValue ?? Number(job.assessableValue);
    const existing = (job.lines as unknown as Line[]).map((l) => ({ code: l.code, amount: l.amount }));
    // the duty breakdown (cess, customs duty, sales tax ...) adds up into charge 101
    const duties = this.cleanDuties((dto.duties ?? job.duties) as Record<string, unknown>);
    const dutyTotal = Object.values(duties).reduce((s, n) => s + n, 0);
    let source = dto.charges ?? existing;
    if (dutyTotal > 0) {
      source = [...source.filter((c) => c.code !== '101'), { code: '101', amount: dutyTotal }];
    }
    const psid = dto.paidThroughPsid ?? job.paidThroughPsid;
    const nocs = this.cleanNocs(dto.nocs ?? job.nocs);
    const bilty = dto.biltyTransport === undefined ? this.cleanBilty(job.biltyTransport) : this.cleanBilty(dto.biltyTransport);
    const containers = this.cleanContainers(dto.containers ?? job.containers);
    const { lines, total } = this.build(source, { psid, nocs, bilty });
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
        collectorate: text(dto.collectorate?.slice(0, 200)),
        modeOfTransport: text(dto.modeOfTransport),
        virNumber: text(dto.virNumber?.toUpperCase()),
        duties: dto.duties ? (duties as Prisma.InputJsonValue) : undefined,
        gdNo: text(dto.gdNo),
        lines: lines as unknown as Prisma.InputJsonValue,
        total,
        paidThroughPsid: psid,
        containers: containers as Prisma.InputJsonValue,
        nocs: nocs as unknown as Prisma.InputJsonValue,
        biltyTransport: bilty ? (bilty as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
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

  // Gives the job an invoice number. DRAFT stays editable; UNPAID means it is issued.
  private async makeInvoice(id: string, payment: ClearancePayment) {
    const job = await this.findOne(id);
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
        payment,
        dueAmount: 0,
      },
    });
    return this.findOne(id);
  }

  async generateInvoice(id: string) {
    const job = await this.findOne(id);
    if (job.invoiceNo) throw new ConflictException('Invoice already exists for this job');
    return this.makeInvoice(id, ClearancePayment.UNPAID);
  }

  // Save as draft: the invoice exists (and is listed) but is not issued yet.
  async saveDraft(id: string) {
    const job = await this.findOne(id);
    if (job.invoiceNo) return job;
    return this.makeInvoice(id, ClearancePayment.DRAFT);
  }

  // Sharing the invoice issues it. Creates it first if it does not exist yet.
  async issue(id: string) {
    const job = await this.findOne(id);
    if (!job.invoiceNo) return this.makeInvoice(id, ClearancePayment.UNPAID);
    if (job.payment !== ClearancePayment.DRAFT) return job;
    await this.prisma.clearanceJob.update({
      where: { id },
      data: { payment: ClearancePayment.UNPAID, dueAmount: 0 },
    });
    return this.findOne(id);
  }

  async removeInvoice(id: string) {
    const job = await this.findOne(id);
    if (!job.invoiceNo) throw new BadRequestException('This job has no invoice');
    // the payments belonged to that invoice, so they go with it
    await this.prisma.$transaction([
      this.prisma.payment.deleteMany({ where: { clearanceJobId: id } }),
      this.prisma.clearanceJob.update({
        where: { id },
        data: { invoiceNo: null, invoicedAt: null, payment: null, dueAmount: 0 },
      }),
    ]);
    return this.findOne(id);
  }

  // PAID = fully paid, UNPAID = nothing paid, PARTIAL = part paid with dueAmount still owed.
  // PAID / PARTIAL record the payment (cash, cheque or online) so it shows on the invoice list.
  async setPayment(
    id: string,
    status: 'PAID' | 'UNPAID' | 'PARTIAL',
    dueAmount?: number,
    pay?: PaymentInfoDto,
  ) {
    const job = await this.findOne(id);
    if (!job.invoiceNo) throw new BadRequestException('Generate the invoice first');
    if (status !== 'UNPAID') this.checkPaymentInfo(pay);
    // what the customer still owed before this payment
    const owedBefore =
      job.payment === ClearancePayment.PAID
        ? 0
        : job.payment === ClearancePayment.PARTIAL
          ? Number(job.dueAmount)
          : Number(job.total);

    if (status === 'PARTIAL') {
      if (dueAmount == null) throw new BadRequestException('Enter the remaining dues amount');
      if (dueAmount >= Number(job.total)) {
        throw new BadRequestException(
          'Remaining dues must be less than the invoice total. Use "Unpaid" if nothing has been paid.',
        );
      }
      const row = this.paymentRow(id, owedBefore - dueAmount, pay);
      await this.prisma.$transaction([
        this.prisma.clearanceJob.update({
          where: { id },
          data: { payment: ClearancePayment.PARTIAL, dueAmount },
        }),
        ...(row ? [this.prisma.payment.create({ data: row })] : []),
      ]);
    } else {
      const row = status === 'PAID' ? this.paymentRow(id, owedBefore, pay) : null;
      await this.prisma.$transaction([
        this.prisma.clearanceJob.update({
          where: { id },
          data: {
            payment: status === 'PAID' ? ClearancePayment.PAID : ClearancePayment.UNPAID,
            dueAmount: 0,
          },
        }),
        ...(row ? [this.prisma.payment.create({ data: row })] : []),
      ]);
    }
    return this.findOne(id);
  }

  async pdf(id: string) {
    const job = await this.findOne(id);
    // before the invoice exists this is a preview of the saved details
    const invoiceNo = job.invoiceNo ?? 'DRAFT';
    const buffer = await buildClearancePdf({
      jobNo: job.jobNo,
      invoiceNo,
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
      collectorate: job.collectorate,
      virNumber: job.virNumber,
      duties: job.duties,
      paidThroughPsid: job.paidThroughPsid,
      modeOfTransport: job.modeOfTransport,
      containers: this.cleanContainers(job.containers),
      lines: (job.lines as unknown as Line[]).map((l) => ({ code: l.code, label: l.label, amount: l.amount })),
    });
    return { buffer, filename: `${job.invoiceNo ?? `${job.jobNo}-draft`}.pdf` };
  }

  // from/to: jobs are counted by created date, invoices by invoice date (created date for unsent drafts)
  async stats(from?: string, to?: string) {
    const range = dayRange(from, to);
    const rows = await this.prisma.clearanceJob.findMany({
      select: { status: true, payment: true, total: true, dueAmount: true, createdAt: true, invoicedAt: true },
    });
    const all = rows.filter((j) => inDayRange(j.createdAt, range));
    const invoicedIn = rows.filter((j) => inDayRange(j.invoicedAt ?? j.createdAt, range));
    const byStatus: Record<string, number> = {};
    for (const j of all) byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;

    const live = all.filter((j) => j.status !== ClearanceStatus.CANCELLED);
    const liveInv = invoicedIn.filter((j) => j.status !== ClearanceStatus.CANCELLED);
    const invoiced = liveInv.filter(
      (j) => j.payment !== null && j.payment !== ClearancePayment.DRAFT,
    );
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
        (j) => j.status === ClearanceStatus.RELEASED && j.payment === null,
      ).length,
      byStatus,
      invoices: {
        notInvoiced: live.filter((j) => j.payment === null).length,
        drafts: liveInv.filter((j) => j.payment === ClearancePayment.DRAFT).length,
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