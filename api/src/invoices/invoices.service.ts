import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CostPayment,
  DuesReportStatus,
  InvoiceStatus,
  PaymentDirection,
  PaymentMethod,
  Prisma,
  ShipmentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { dayRange } from '../common/date-range.js';
import type { CreateShipmentDto } from '../shipments/dto.js';
import type { AddCostDto, PaymentInfoDto } from './dto.js';
import { ShipmentsService } from '../shipments/shipments.service.js';
import { buildInvoicePdf } from './invoice-pdf.js';
import { buildDuesPdf } from './dues-pdf.js';
import { buildDebitsPdf } from './debits-pdf.js';
import type { LedgerItem } from './debits-pdf.js';
import type { DuesData, DuesItem, DuesScope } from './dues-pdf.js';
import type { PdfInvoice } from './invoice-pdf.js';

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private shipments: ShipmentsService,
  ) {}

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

  // Payment row for money that just moved. Nothing is saved when no method was sent or nothing was paid.
  private paymentRow(
    direction: PaymentDirection,
    target: { invoiceId?: string; costId?: string },
    amount: number,
    pay?: PaymentInfoDto,
  ): Prisma.PaymentCreateManyInput | null {
    if (!pay?.method || !(amount > 0)) return null;
    return {
      direction,
      method: pay.method as PaymentMethod,
      reference: pay.reference?.trim() || null,
      amount: Math.round(amount * 100) / 100,
      hasImage: !!pay.image,
      imageData: pay.image ?? null,
      ...target,
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

  // Next number after the highest existing one (safe after deletions).
  private async nextInvoiceNo() {
    const prefix = `INV-${new Date().getFullYear()}-`;
    const last = await this.prisma.invoice.findFirst({
      where: { invoiceNo: { startsWith: prefix } },
      orderBy: { invoiceNo: 'desc' },
      select: { invoiceNo: true },
    });
    const n = last ? Number(last.invoiceNo.slice(prefix.length)) || 0 : 0;
    return `${prefix}${String(n + 1).padStart(5, '0')}`;
  }

  async createForShipment(shipmentId: string) {
    const shipment = await this.shipments.findOne(shipmentId);
    if (shipment.invoice) throw new ConflictException('Invoice already exists for this shipment');
    if (shipment.status === ShipmentStatus.CANCELLED) {
      throw new ConflictException('Cannot invoice a cancelled shipment');
    }

    const q = await this.shipments.quoteForShipment(shipmentId);
    const invoiceNo = await this.nextInvoiceNo();

    return this.prisma.invoice.create({
      data: {
        invoiceNo,
        shipmentId,
        total: q.total,
        lines: {
          create: q.lines.map((l) => ({
            label: l.label,
            amount: l.pkr,
            currency: l.currency,
            foreignAmount: l.foreign,
            exRate: l.rate,
          })),
        },
      },
      include: { lines: true },
    });
  }

  // The shipment-shaped block the PDF prints (route, packages, customer ...).
  private pdfShipment(
    dto: CreateShipmentDto,
    customer: { name: string; address: string | null; phone: string | null; taxNumber: string | null },
    exRate: number | null,
    refNo: string,
  ): PdfInvoice['shipment'] {
    return {
      refNo,
      mode: dto.mode,
      origin: dto.origin.trim(),
      destination: dto.destination.trim(),
      viaPoints: (dto.viaPoints ?? []).map((p) => p.trim()).filter(Boolean),
      blAwbNo: dto.blAwbNo ?? null,
      hawbNo: dto.hawbNo ?? null,
      flight: dto.flight ?? null,
      eta: dto.eta ?? null,
      volDivisor: dto.rate?.volDivisor ?? null,
      exRate,
      details: dto.details ?? null,
      grossWeightKg: dto.grossWeightKg ?? null,
      chargeableWeightKg: dto.chargeableWeightKg ?? null,
      items: dto.items,
      customer: {
        name: customer.name,
        address: customer.address,
        phone: customer.phone,
        taxNumber: customer.taxNumber,
      },
    };
  }

  // An invoice on its own: no quotation, no shipment. Nothing else is created.
  async createDirect(dto: CreateShipmentDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    const q = await this.shipments.quote(dto);
    const invoiceNo = await this.nextInvoiceNo();

    return this.prisma.invoice.create({
      data: {
        invoiceNo,
        customerId: dto.customerId,
        details: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue,
        total: q.total,
        lines: {
          create: q.lines.map((l) => ({
            label: l.label,
            amount: l.pkr,
            currency: l.currency,
            foreignAmount: l.foreign,
            exRate: l.rate,
          })),
        },
      },
      include: { lines: true, customer: { select: { name: true } } },
    });
  }

  // Builds a PDF from the form data. Nothing is saved.
  async preview(dto: CreateShipmentDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    const q = await this.shipments.quote(dto);

    const inv: PdfInvoice = {
      invoiceNo: 'PREVIEW',
      status: 'PREVIEW',
      issuedAt: new Date(),
      total: q.total,
      lines: q.lines.map((l) => ({
        label: l.label,
        amount: l.pkr,
        currency: l.currency,
        foreignAmount: l.foreign,
        exRate: l.rate,
      })),
      shipment: this.pdfShipment(dto, customer, q.exRate, 'Not saved'),
    };
    const buffer = await buildInvoicePdf(inv);
    return { buffer, filename: 'invoice-preview.pdf' };
  }

  // "YYYY-MM-DD" day range in Pakistan time (UTC+5), so a report for "this month" matches the office calendar
  private dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    return dayRange(from, to);
  }

  list(payment?: string, customer?: string, from?: string, to?: string) {
    const paymentWhere =
      payment === 'PAID'
        ? { status: InvoiceStatus.PAID }
        : payment === 'DUES'
          ? { status: InvoiceStatus.ISSUED } // issued and not fully paid: what the customer still owes
        : payment === 'DRAFT'
          ? { status: InvoiceStatus.DRAFT }
          : payment === 'UNPAID'
          ? { status: { not: InvoiceStatus.PAID } }
          : {};
    const name = customer?.trim();
    const like = { contains: name, mode: 'insensitive' as const };
    const customerWhere = name
      ? { OR: [{ customer: { name: like } }, { shipment: { customer: { name: like } } }] }
      : {};
    const range = this.dateRange(from, to);
    return this.prisma.invoice
      .findMany({
        where: { ...paymentWhere, ...customerWhere, ...(range && { issuedAt: range }) },
        include: {
          customer: { select: { name: true } },
          shipment: {
            select: { refNo: true, blAwbNo: true, hawbNo: true, customer: { select: { name: true } } },
          },
          costs: { select: { amount: true } },
          payments: InvoicesService.lastPaymentSelect,
        },
        orderBy: { issuedAt: 'desc' },
      })
      .then((rows) =>
        rows.map(({ costs, payments, ...r }) => {
          const costTotal = costs.reduce((sum, c) => sum + Number(c.amount), 0);
          // a standalone invoice keeps its master / house numbers in the saved details
          const d = (r.details ?? {}) as { blAwbNo?: string; hawbNo?: string };
          return {
            ...r,
            mawb: r.shipment?.blAwbNo ?? d.blAwbNo ?? '',
            hawb: r.shipment?.hawbNo ?? d.hawbNo ?? '',
            lastPayment: payments[0] ?? null,
            // still owed by the customer: part-paid -> what is left, unpaid -> the whole total
            remaining:
              r.status === InvoiceStatus.ISSUED
                ? Number(r.dueAmount) > 0
                  ? Number(r.dueAmount)
                  : Number(r.total)
                : 0,
            customerName: r.customer?.name ?? r.shipment?.customer.name ?? '',
            costTotal: Math.round(costTotal * 100) / 100,
            profit: Math.round((Number(r.total) - costTotal) * 100) / 100,
          };
        }),
      );
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        lines: true,
        customer: true,
        shipment: { include: { customer: true, items: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  // Dashboard figures. Drafts and cancelled invoices are not counted as invoiced.
  async summary(from?: string, to?: string) {
    const range = this.dateRange(from, to);
    const rows = await this.prisma.invoice.findMany({
      where: { status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PAID] }, ...(range && { issuedAt: range }) },
      select: { status: true, total: true, dueAmount: true, costs: { select: { amount: true } } },
    });
    let invoiced = 0;
    let outstanding = 0;
    let costs = 0;
    for (const r of rows) {
      const total = Number(r.total);
      invoiced += total;
      costs += r.costs.reduce((sum, c) => sum + Number(c.amount), 0);
      if (r.status === InvoiceStatus.ISSUED) {
        const due = Number(r.dueAmount);
        outstanding += due > 0 ? due : total; // partly paid: what is left; unpaid: everything
      }
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      invoiced: round(invoiced),
      collected: round(invoiced - outstanding),
      outstanding: round(outstanding),
      costs: round(costs),
      profit: round(invoiced - costs),
    };
  }

  // Invoices start as DRAFT. Sending one makes it ISSUED (paid ones stay paid).
  async issue(id: string) {
    const invoice = await this.findOne(id);
    if (invoice.status !== InvoiceStatus.DRAFT) return invoice;
    return this.prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.ISSUED } });
  }

  // Payment status only. This never touches the shipment's status.
  // PAID = fully paid, UNPAID = nothing paid, PARTIAL = part paid with dueAmount still owed.
  // A credit payment (money received from the customer) is recorded with PAID / PARTIAL.
  async updateStatus(
    id: string,
    status: 'PAID' | 'UNPAID' | 'PARTIAL',
    dueAmount?: number,
    pay?: PaymentInfoDto,
  ) {
    const invoice = await this.findOne(id);
    if (status !== 'UNPAID') this.checkPaymentInfo(pay);
    // what the customer still owed before this payment
    const owedBefore =
      invoice.status === InvoiceStatus.PAID
        ? 0
        : Number(invoice.dueAmount) > 0
          ? Number(invoice.dueAmount)
          : Number(invoice.total);

    if (status === 'PARTIAL') {
      if (dueAmount == null) {
        throw new BadRequestException('Enter the remaining dues amount');
      }
      if (dueAmount >= Number(invoice.total)) {
        throw new BadRequestException(
          'Remaining dues must be less than the invoice total. Use "Mark unpaid" if nothing has been paid.',
        );
      }
      const row = this.paymentRow(PaymentDirection.CREDIT, { invoiceId: id }, owedBefore - dueAmount, pay);
      const [updated] = await this.prisma.$transaction([
        this.prisma.invoice.update({
          where: { id },
          data: { status: InvoiceStatus.ISSUED, dueAmount },
        }),
        ...(row ? [this.prisma.payment.create({ data: row })] : []),
      ]);
      return updated;
    }

    const row =
      status === 'PAID' ? this.paymentRow(PaymentDirection.CREDIT, { invoiceId: id }, owedBefore, pay) : null;
    const [updated] = await this.prisma.$transaction([
      this.prisma.invoice.update({
        where: { id },
        data: {
          status: status === 'PAID' ? InvoiceStatus.PAID : InvoiceStatus.ISSUED,
          dueAmount: 0,
        },
      }),
      ...(row ? [this.prisma.payment.create({ data: row })] : []),
    ]);
    return updated;
  }

  // Change a standalone invoice. The number, status and payments stay; details, lines and total are rebuilt.
  async update(id: string, dto: CreateShipmentDto) {
    const invoice = await this.findOne(id);
    if (invoice.shipmentId) {
      throw new BadRequestException('This invoice belongs to a shipment, so it cannot be edited here');
    }
    if (invoice.status === InvoiceStatus.PAID) {
      throw new ConflictException('A paid invoice cannot be edited. Mark it unpaid first.');
    }
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    const q = await this.shipments.quote(dto);
    const newTotal = Number(q.total);
    const round = (n: number) => Math.round(n * 100) / 100;

    // part-paid invoice: what is still owed moves with the total
    let due = Number(invoice.dueAmount);
    let status: InvoiceStatus = invoice.status;
    if (due > 0) {
      due = round(due + (newTotal - Number(invoice.total)));
      if (due <= 0) {
        due = 0;
        status = InvoiceStatus.PAID;
      } else if (due >= newTotal) {
        due = 0;
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      return tx.invoice.update({
        where: { id },
        data: {
          customerId: dto.customerId,
          details: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue,
          total: q.total,
          dueAmount: due,
          status,
          lines: {
            create: q.lines.map((l) => ({
              label: l.label,
              amount: l.pkr,
              currency: l.currency,
              foreignAmount: l.foreign,
              exRate: l.rate,
            })),
          },
        },
        include: { lines: true, customer: { select: { name: true } } },
      });
    });
  }

  // ---- costs (debit) and profit
  async costs(id: string) {
    const invoice = await this.findOne(id);
    const costs = await this.prisma.invoiceCost.findMany({
      where: { invoiceId: id },
      orderBy: { incurredAt: 'asc' },
    });
    const revenue = Number(invoice.total);
    const costTotal = costs.reduce((sum, c) => sum + Number(c.amount), 0);
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      costs,
      revenue: round(revenue),
      costTotal: round(costTotal),
      profit: round(revenue - costTotal),
      margin: revenue > 0 ? round(((revenue - costTotal) / revenue) * 100) : 0,
    };
  }

  // All debits of all invoices. ?vendor= partial company name, ?payment= PAID | UNPAID | PARTIAL
  async listCosts(vendor?: string, payment?: string, from?: string, to?: string) {
    const where: Prisma.InvoiceCostWhereInput = {};
    const range = this.dateRange(from, to);
    if (range) where.incurredAt = range; // the debit's own date
    const name = vendor?.trim();
    if (name) where.vendor = { contains: name, mode: 'insensitive' };
    if (payment && payment in CostPayment) where.payment = payment as CostPayment;
    const rows = await this.prisma.invoiceCost.findMany({
      where,
      include: {
        invoice: {
          select: {
            invoiceNo: true,
            customer: { select: { name: true } },
            shipment: { select: { customer: { select: { name: true } } } },
          },
        },
        payments: InvoicesService.lastPaymentSelect,
      },
      orderBy: { incurredAt: 'desc' },
    });
    return rows.map(({ invoice, payments, ...c }) => ({
      ...c,
      lastPayment: payments[0] ?? null,
      invoiceNo: invoice.invoiceNo,
      customerName: invoice.customer?.name ?? invoice.shipment?.customer.name ?? '',
    }));
  }

  // Vendor ledger PDF: the debits the Debits page shows (same vendor / status / date filters), grouped by vendor.
  async debitsPdf(vendor?: string, payment?: string, from?: string, to?: string) {
    const where: Prisma.InvoiceCostWhereInput = {};
    const range = this.dateRange(from, to);
    if (range) where.incurredAt = range;
    const name = vendor?.trim();
    if (name) where.vendor = { contains: name, mode: 'insensitive' };
    const status = payment && payment in CostPayment ? (payment as CostPayment) : undefined;
    if (status) where.payment = status;
    const rows = await this.prisma.invoiceCost.findMany({
      where,
      include: {
        invoice: {
          select: { invoiceNo: true, details: true, shipment: { select: { blAwbNo: true, hawbNo: true } } },
        },
      },
      orderBy: { incurredAt: 'asc' },
    });
    if (rows.length === 0) throw new BadRequestException('There are no debits for this filter');

    const round = (n: number) => Math.round(n * 100) / 100;
    const groups = new Map<string, LedgerItem[]>();
    for (const r of rows) {
      const amount = Number(r.amount);
      const remaining =
        r.payment === CostPayment.PAID ? 0 : r.payment === CostPayment.PARTIAL ? Number(r.dueAmount) : amount;
      const d = (r.invoice.details ?? {}) as { blAwbNo?: string; hawbNo?: string };
      const mawb = r.invoice.shipment?.blAwbNo ?? d.blAwbNo ?? '';
      const hawb = r.invoice.shipment?.hawbNo ?? d.hawbNo ?? '';
      const key = r.vendor?.trim() || 'No vendor';
      const list = groups.get(key) ?? [];
      list.push({
        date: r.incurredAt,
        label: r.label,
        invoiceNo: r.invoice.invoiceNo,
        ref: [mawb, hawb].filter(Boolean).join(' / '),
        amount: round(amount),
        paid: round(amount - remaining),
        remaining: round(remaining),
      });
      groups.set(key, list);
    }
    const vendors = [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([n, items]) => ({ name: n, items }));
    const buffer = await buildDebitsPdf({
      vendors,
      period: from || to ? { from: from || undefined, to: to || undefined } : undefined,
      payment: status,
      date: new Date(),
    });
    const who = vendors.length === 1 ? vendors[0].name : 'All vendors';
    return { buffer, filename: `Vendor ledger - ${this.safeName(who)}.pdf` };
  }

  // Same rules as invoice payments: PARTIAL needs the remaining amount, which must be below the cost.
  // A debit payment (money paid out to the vendor) is recorded with PAID / PARTIAL.
  async setCostPayment(
    costId: string,
    status: 'PAID' | 'UNPAID' | 'PARTIAL',
    dueAmount?: number,
    pay?: PaymentInfoDto,
  ) {
    const cost = await this.prisma.invoiceCost.findUnique({ where: { id: costId } });
    if (!cost) throw new NotFoundException('Cost not found');
    if (status !== 'UNPAID') this.checkPaymentInfo(pay);
    // what we still owed the vendor before this payment
    const owedBefore =
      cost.payment === CostPayment.PAID
        ? 0
        : cost.payment === CostPayment.PARTIAL
          ? Number(cost.dueAmount)
          : Number(cost.amount);
    if (status === 'PARTIAL') {
      if (dueAmount == null) throw new BadRequestException('Enter the remaining dues amount');
      if (dueAmount >= Number(cost.amount)) {
        throw new BadRequestException(
          'Remaining dues must be less than the cost amount. Use "Unpaid" if nothing has been paid.',
        );
      }
      const row = this.paymentRow(PaymentDirection.DEBIT, { costId }, owedBefore - dueAmount, pay);
      const [updated] = await this.prisma.$transaction([
        this.prisma.invoiceCost.update({
          where: { id: costId },
          data: { payment: CostPayment.PARTIAL, dueAmount },
        }),
        ...(row ? [this.prisma.payment.create({ data: row })] : []),
      ]);
      return updated;
    }
    const row =
      status === 'PAID' ? this.paymentRow(PaymentDirection.DEBIT, { costId }, owedBefore, pay) : null;
    const [updated] = await this.prisma.$transaction([
      this.prisma.invoiceCost.update({
        where: { id: costId },
        data: { payment: status === 'PAID' ? CostPayment.PAID : CostPayment.UNPAID, dueAmount: 0 },
      }),
      ...(row ? [this.prisma.payment.create({ data: row })] : []),
    ]);
    return updated;
  }

  async addCost(id: string, dto: AddCostDto) {
    await this.findOne(id);
    const currency = dto.currency?.trim().toUpperCase() || 'PKR';
    const foreign = currency !== 'PKR';
    if (foreign && !dto.exRate) {
      throw new BadRequestException(`Enter the exchange rate (PKR per 1 ${currency})`);
    }
    const pkr = foreign ? Math.round(dto.amount * dto.exRate! * 100) / 100 : dto.amount;
    await this.prisma.invoiceCost.create({
      data: {
        invoiceId: id,
        label: dto.label.trim(),
        vendor: dto.vendor?.trim() || null,
        amount: pkr,
        currency: foreign ? currency : null,
        foreignAmount: foreign ? dto.amount : null,
        exRate: foreign ? dto.exRate : null,
        note: dto.note?.trim() || null,
        incurredAt: dto.incurredAt ? new Date(dto.incurredAt) : undefined,
      },
    });
    return this.costs(id);
  }

  async removeCost(id: string, costId: string) {
    const found = await this.prisma.invoiceCost.findFirst({ where: { id: costId, invoiceId: id } });
    if (!found) throw new NotFoundException('Cost not found');
    await this.prisma.invoiceCost.delete({ where: { id: costId } });
    return this.costs(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.invoice.delete({ where: { id } });
    return { deleted: true };
  }

  // ---- remaining dues statement (customer ledger)
  // Issued invoices that are not fully paid. Drafts, paid and cancelled invoices are left out.
  private async duesFor(
    customerId: string,
    scope: DuesScope = 'DUES',
    from?: string,
    to?: string,
  ): Promise<DuesData> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    const range = this.dateRange(from, to);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        // ALL = issued + paid. DUES / UNPAID = issued. PAID and DRAFT = just those. Cancelled are never listed.
        status:
          scope === 'ALL'
            ? { in: [InvoiceStatus.ISSUED, InvoiceStatus.PAID] }
            : scope === 'PAID'
              ? InvoiceStatus.PAID
              : scope === 'DRAFT'
                ? InvoiceStatus.DRAFT
                : InvoiceStatus.ISSUED,
        OR: [{ customerId }, { shipment: { customerId } }],
        ...(range && { issuedAt: range }),
      },
      include: { shipment: { select: { blAwbNo: true, hawbNo: true } } },
      orderBy: { issuedAt: 'asc' },
    });

    const round = (n: number) => Math.round(n * 100) / 100;
    const allItems: DuesItem[] = invoices.map((r) => {
      const total = Number(r.total);
      const isDraft = r.status === InvoiceStatus.DRAFT;
      const remaining =
        r.status === InvoiceStatus.PAID
          ? 0
          : !isDraft && Number(r.dueAmount) > 0
            ? Number(r.dueAmount)
            : total;
      const d = (r.details ?? {}) as { blAwbNo?: string; hawbNo?: string };
      return {
        invoiceNo: r.invoiceNo,
        issuedAt: r.issuedAt,
        mawb: r.shipment?.blAwbNo ?? d.blAwbNo ?? '',
        hawb: r.shipment?.hawbNo ?? d.hawbNo ?? '',
        total: round(total),
        paid: round(total - remaining),
        remaining: round(remaining),
        status: isDraft ? 'Draft' : remaining <= 0 ? 'Paid' : remaining < total ? 'Partial' : 'Unpaid',
      };
    });
    // UNPAID = nothing received yet (part-paid ones are in DUES)
    const listed = scope === 'UNPAID' ? allItems.filter((i) => i.status === 'Unpaid') : allItems;
    const items = listed;
    const sum = (f: (i: DuesItem) => number) => round(items.reduce((a, i) => a + f(i), 0));
    return {
      scope,
      period: from || to ? { from: from || undefined, to: to || undefined } : undefined,
      customer: {
        name: customer.name,
        address: customer.address,
        phone: customer.phone,
        taxNumber: customer.taxNumber,
      },
      items,
      totalInvoiced: sum((i) => i.total),
      totalPaid: sum((i) => i.paid),
      totalRemaining: sum((i) => i.remaining),
    };
  }

  private safeName(v: string) {
    return v.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // "View report": built from today's figures, nothing is saved.
  async duesPdf(customerId: string, scope: DuesScope = 'DUES', from?: string, to?: string) {
    const data = await this.duesFor(customerId, scope, from, to);
    const buffer = await buildDuesPdf({ ...data, date: new Date() });
    const kind = scope === 'DUES' ? 'Dues statement' : 'Statement';
    return { buffer, filename: `${kind} - ${this.safeName(data.customer.name)}.pdf` };
  }

  private async nextDuesReportNo() {
    const prefix = `DR-${new Date().getFullYear()}-`;
    const last = await this.prisma.duesReport.findFirst({
      where: { reportNo: { startsWith: prefix } },
      orderBy: { reportNo: 'desc' },
      select: { reportNo: true },
    });
    const n = last ? Number(last.reportNo.slice(prefix.length)) || 0 : 0;
    return `${prefix}${String(n + 1).padStart(5, '0')}`;
  }

  // "Save draft" (DRAFT) or a copy of what was shared (SENT). The figures are frozen in the snapshot.
  async saveDuesReport(
    customerId: string,
    status: 'DRAFT' | 'SENT' = 'DRAFT',
    scope: DuesScope = 'DUES',
    from?: string,
    to?: string,
  ) {
    const data = await this.duesFor(customerId, scope, from, to);
    if (data.items.length === 0) {
      throw new BadRequestException(
        from || to
          ? 'This customer has no invoices in the selected dates'
          : scope === 'DUES' ? 'This customer has no remaining dues' : 'This customer has no invoices for this report',
      );
    }
    const reportNo = await this.nextDuesReportNo();
    return this.prisma.duesReport.create({
      data: {
        reportNo,
        customerId,
        scope,
        status: status === 'SENT' ? DuesReportStatus.SENT : DuesReportStatus.DRAFT,
        totalDue: data.totalRemaining,
        invoiceCount: data.items.length,
        snapshot: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue,
      },
      select: { id: true, reportNo: true, customerId: true, scope: true, status: true, totalDue: true, invoiceCount: true, createdAt: true },
    });
  }

  listDuesReports(customerId: string) {
    return this.prisma.duesReport.findMany({
      // only drafts: a report that was sent leaves the list (it stays stored as a record)
      where: { customerId, status: DuesReportStatus.DRAFT },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, reportNo: true, customerId: true, scope: true, status: true, totalDue: true, invoiceCount: true, createdAt: true },
    });
  }

  // A draft that was shared with the customer becomes SENT and leaves the drafts list.
  async markDuesReportSent(reportId: string) {
    const rep = await this.prisma.duesReport.findUnique({ where: { id: reportId }, select: { id: true } });
    if (!rep) throw new NotFoundException('Report not found');
    await this.prisma.duesReport.update({ where: { id: reportId }, data: { status: DuesReportStatus.SENT } });
    return { sent: true };
  }

  // Only drafts can be deleted. A sent report is kept as the record of what the customer received.
  async removeDuesReport(reportId: string) {
    const rep = await this.prisma.duesReport.findUnique({ where: { id: reportId }, select: { status: true } });
    if (!rep) throw new NotFoundException('Report not found');
    if (rep.status === DuesReportStatus.SENT) {
      throw new ConflictException('A sent report cannot be deleted');
    }
    await this.prisma.duesReport.delete({ where: { id: reportId } });
    return { deleted: true };
  }

  // A saved report, printed exactly as it was saved.
  async duesReportPdf(reportId: string) {
    const rep = await this.prisma.duesReport.findUnique({ where: { id: reportId } });
    if (!rep) throw new NotFoundException('Report not found');
    const data = rep.snapshot as unknown as DuesData;
    const buffer = await buildDuesPdf({ ...data, reportNo: rep.reportNo, date: rep.createdAt });
    return { buffer, filename: `${rep.reportNo} - ${this.safeName(data.customer.name)}.pdf` };
  }

  async pdf(id: string) {
    const invoice = await this.findOne(id);
    if (invoice.shipment) {
      const buffer = await buildInvoicePdf({ ...invoice, shipment: invoice.shipment });
      return { buffer, filename: `${invoice.invoiceNo}.pdf` };
    }
    // standalone invoice: print from the details saved with it
    const dto = invoice.details as unknown as CreateShipmentDto;
    if (!invoice.customer || !dto) throw new NotFoundException('Invoice details are missing');
    const q = await this.shipments.quote(dto);
    const buffer = await buildInvoicePdf({
      ...invoice,
      shipment: this.pdfShipment(dto, invoice.customer, q.exRate, ''),
    });
    return { buffer, filename: `${invoice.invoiceNo}.pdf` };
  }
}