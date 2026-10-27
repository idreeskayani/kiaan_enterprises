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
  ShipmentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateClearanceDto, UpdateClearanceDto } from './dto.js';

type Line = { label: string; amount: number; kind: 'FREIGHT' | 'TAX' | 'CHARGE' };
type Imported = { label: string; amount: number };

function buildClearancePdf(data: {
  jobNo: string;
  invoiceNo: string;
  payment: ClearancePayment;
  invoicedAt: Date;
  total: unknown;
  gdNo: string | null;
  customerName: string;
  customerAddress: string | null;
  customerPhone: string | null;
  customerTax: string | null;
  details: unknown;
  freightInvoiceNo: string | null | undefined;
  lines: { label: string; amount: number }[];
}): Buffer {
  const details = data.details && typeof data.details === 'object'
    ? Object.entries(data.details as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([key, value]) => `${key}: ${value}`)
    : [];
  const text = [
    'CLEARANCE INVOICE',
    `Invoice: ${data.invoiceNo}    Job: ${data.jobNo}`,
    `Date: ${data.invoicedAt.toLocaleDateString()}    Payment: ${data.payment}`,
    `Customer: ${data.customerName}`,
    ...(data.customerAddress ? [`Address: ${data.customerAddress}`] : []),
    ...(data.customerPhone ? [`Phone: ${data.customerPhone}`] : []),
    ...(data.customerTax ? [`Tax No: ${data.customerTax}`] : []),
    ...(data.gdNo ? [`GD No: ${data.gdNo}`] : []),
    ...(data.freightInvoiceNo ? [`Freight invoice: ${data.freightInvoiceNo}`] : []),
    ...details,
    '',
    'Description                                      Amount',
    ...data.lines.map((line) => `${line.label}    ${Number(line.amount).toFixed(2)}`),
    '',
    `TOTAL: ${Number(data.total).toFixed(2)}`,
  ].map((line) => line.replace(/[^\x20-\x7e]/g, '?'));
  const commands = ['BT', '/F1 11 Tf', '50 790 Td'];
  for (const [index, line] of text.entries()) {
    if (index) commands.push('0 -16 Td');
    commands.push(`(${line.replace(/[\\()]/g, '\\$&')}) Tj`);
  }
  commands.push('ET');
  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const DETAIL_KEYS = [
  'mode', 'origin', 'destination', 'blNo', 'hawbNo', 'flight', 'commodity',
  'pcs', 'weightKg', 'igmNo', 'igmDate', 'beDate', 'custRef',
];

// For jobs imported from a Kiaan shipment: when one of these stages is reached,
// the Kiaan shipment moves to the matching status. Empty this object to switch it off.
const SHIPMENT_SYNC: Partial<Record<ClearanceStatus, ShipmentStatus>> = {
  GD_FILED: ShipmentStatus.AWAITING_GATEPASS,
  EXAMINATION: ShipmentStatus.CUSTOMS_EXAM,
  RELEASED: ShipmentStatus.GATEPASS_ISSUED,
  ON_HOLD: ShipmentStatus.ON_HOLD,
};

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

  // Duty on value, sales tax on value + duty, income tax (WHT) on value + duty + sales tax.
  private taxLines(
    hs: { dutyPct: unknown; salesTaxPct: unknown; whtPct: unknown } | null,
    av: number,
  ): Line[] {
    if (!hs || av <= 0) return [];
    const dutyPct = Number(hs.dutyPct);
    const stPct = Number(hs.salesTaxPct);
    const whtPct = Number(hs.whtPct);
    const duty = (av * dutyPct) / 100;
    const st = ((av + duty) * stPct) / 100;
    const wht = ((av + duty + st) * whtPct) / 100;
    const out: Line[] = [];
    if (duty > 0) out.push({ label: `Customs Duty (${dutyPct}%)`, amount: r2(duty), kind: 'TAX' });
    if (st > 0) out.push({ label: `Sales Tax (${stPct}%)`, amount: r2(st), kind: 'TAX' });
    if (wht > 0) out.push({ label: `Income Tax / WHT (${whtPct}%)`, amount: r2(wht), kind: 'TAX' });
    return out;
  }

  private async build(opts: {
    hsCodeId: string | null;
    av: number;
    manual: { label: string; amount: number }[];
    imported: Imported[];
    includeFreight: boolean;
  }) {
    let hs = null;
    if (opts.hsCodeId) {
      hs = await this.prisma.hsCode.findUnique({ where: { id: opts.hsCodeId } });
      if (!hs) throw new NotFoundException('HS code not found');
    }
    const lines: Line[] = [
      ...(opts.includeFreight
        ? opts.imported.map((l) => ({ label: l.label, amount: r2(l.amount), kind: 'FREIGHT' as const }))
        : []),
      ...this.taxLines(hs, opts.av),
      ...opts.manual
        .filter((m) => m.amount > 0 && m.label.trim())
        .map((m) => ({ label: m.label.trim(), amount: r2(m.amount), kind: 'CHARGE' as const })),
    ];
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

  // Kiaan shipment invoices that have not been imported yet.
  importableInvoices() {
    return this.prisma.invoice.findMany({
      where: { clearanceJob: null, status: { not: 'CANCELLED' } },
      select: {
        id: true,
        invoiceNo: true,
        total: true,
        issuedAt: true,
        shipment: {
          select: {
            refNo: true,
            mode: true,
            origin: true,
            destination: true,
            blAwbNo: true,
            customer: { select: { name: true } },
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async create(dto: CreateClearanceDto, userId: string) {
    let data: Omit<Prisma.ClearanceJobUncheckedCreateInput, 'jobNo'>;

    if (dto.sourceInvoiceId) {
      const inv = await this.prisma.invoice.findUnique({
        where: { id: dto.sourceInvoiceId },
        include: {
          lines: true,
          clearanceJob: { select: { jobNo: true } },
          shipment: { include: { customer: true, items: true } },
        },
      });
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.clearanceJob) {
        throw new ConflictException(`This invoice was already imported in ${inv.clearanceJob.jobNo}`);
      }
      const s = inv.shipment;
      const d = (s.details && typeof s.details === 'object' ? s.details : {}) as Record<string, unknown>;
      const pcs = s.items.reduce((a, i) => a + i.qty, 0);
      const kg = s.items.reduce((a, i) => a + Number(i.weightKg) * i.qty, 0);
      const imported: Imported[] = inv.lines.map((l) => ({ label: l.label, amount: Number(l.amount) }));

      data = {
        shipmentId: s.id,
        sourceInvoiceId: inv.id,
        customerName: s.customer.name,
        customerAddress: s.customer.address,
        customerPhone: s.customer.phone,
        customerTax: s.customer.taxNumber,
        details: this.cleanDetails({
          mode: s.mode,
          origin: s.origin,
          destination: s.destination,
          blNo: s.blAwbNo,
          hawbNo: s.hawbNo,
          flight: [d.airline, s.flight].filter(Boolean).join(' / '),
          commodity: d.commodity,
          pcs: String(pcs),
          weightKg: String(r2(kg)),
          igmNo: d.igmNo,
          igmDate: d.igmDate,
          beDate: d.beDate,
          custRef: d.custRef,
        }) as Prisma.InputJsonValue,
        gdNo: typeof d.beNo === 'string' && d.beNo.trim() ? d.beNo.trim() : null,
        importedLines: imported as unknown as Prisma.InputJsonValue,
      };
    } else {
      if (!dto.customerName?.trim()) {
        throw new BadRequestException('Enter the customer name, or import a shipment invoice');
      }
      data = {
        customerName: dto.customerName.trim(),
        customerAddress: dto.customerAddress?.trim() || null,
        customerPhone: dto.customerPhone?.trim() || null,
        customerTax: dto.customerTax?.trim() || null,
      };
    }

    const job = await this.prisma.clearanceJob.create({
      data: {
        ...data,
        jobNo: await this.nextJobNo(),
        history: {
          create: {
            status: ClearanceStatus.PENDING,
            note: dto.sourceInvoiceId ? 'Job opened from imported shipment invoice' : 'Job opened',
            userId,
          },
        },
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
        { shipment: { refNo: c } },
        { sourceInvoice: { invoiceNo: c } },
      ];
    }
    return this.prisma.clearanceJob.findMany({
      where,
      include: { sourceInvoice: { select: { invoiceNo: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const job = await this.prisma.clearanceJob.findUnique({
      where: { id },
      include: {
        hsCode: true,
        sourceInvoice: { select: { invoiceNo: true, total: true } },
        shipment: { select: { id: true, refNo: true, status: true } },
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
    const hsCodeId = dto.hsCodeId === undefined ? job.hsCodeId : dto.hsCodeId || null;
    const av = dto.assessableValue ?? Number(job.assessableValue);
    const includeFreight = dto.includeFreight ?? job.includeFreight;
    const manual =
      dto.charges ?? (job.lines as unknown as Line[]).filter((l) => l.kind === 'CHARGE');
    const { lines, total } = await this.build({
      hsCodeId,
      av,
      manual,
      imported: job.importedLines as unknown as Imported[],
      includeFreight,
    });
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
        hsCodeId,
        assessableValue: av,
        gdNo: text(dto.gdNo),
        includeFreight,
        lines: lines as unknown as Prisma.InputJsonValue,
        total,
      },
    });
    return this.findOne(id);
  }

  async updateStatus(id: string, status: ClearanceStatus, note: string | undefined, userId: string) {
    const job = await this.findOne(id);
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.clearanceJob.update({ where: { id }, data: { status } }),
      this.prisma.clearanceHistory.create({ data: { jobId: id, status, note, userId } }),
    ];
    const sync = SHIPMENT_SYNC[status];
    const sh = job.shipment;
    if (sh && sync && sh.status !== sync && sh.status !== ShipmentStatus.CANCELLED) {
      ops.push(
        this.prisma.shipment.update({ where: { id: sh.id }, data: { status: sync } }),
        this.prisma.statusHistory.create({
          data: { shipmentId: sh.id, status: sync, note: `Clearance: ${status}`, userId },
        }),
      );
    }
    await this.prisma.$transaction(ops);
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
        'Add an HS code with an assessable value, or add charges, before invoicing',
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
      customerName: job.customerName,
      customerAddress: job.customerAddress,
      customerPhone: job.customerPhone,
      customerTax: job.customerTax,
      details: job.details,
      freightInvoiceNo: job.includeFreight ? job.sourceInvoice?.invoiceNo : null,
      lines: (job.lines as unknown as Line[]).map((l) => ({ label: l.label, amount: l.amount })),
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