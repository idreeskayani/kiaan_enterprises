import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CostPayment, InvoiceStatus, Prisma, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateShipmentDto } from '../shipments/dto.js';
import type { AddCostDto } from './dto.js';
import { ShipmentsService } from '../shipments/shipments.service.js';
import { buildInvoicePdf } from './invoice-pdf.js';
import type { PdfInvoice } from './invoice-pdf.js';

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private shipments: ShipmentsService,
  ) {}

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

  list(payment?: string, customer?: string) {
    const paymentWhere =
      payment === 'PAID'
        ? { status: InvoiceStatus.PAID }
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
    return this.prisma.invoice
      .findMany({
        where: { ...paymentWhere, ...customerWhere },
        include: {
          customer: { select: { name: true } },
          shipment: { select: { refNo: true, customer: { select: { name: true } } } },
          costs: { select: { amount: true } },
        },
        orderBy: { issuedAt: 'desc' },
      })
      .then((rows) =>
        rows.map(({ costs, ...r }) => {
          const costTotal = costs.reduce((sum, c) => sum + Number(c.amount), 0);
          return {
            ...r,
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
  async summary() {
    const rows = await this.prisma.invoice.findMany({
      where: { status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PAID] } },
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
  async updateStatus(id: string, status: 'PAID' | 'UNPAID' | 'PARTIAL', dueAmount?: number) {
    const invoice = await this.findOne(id);

    if (status === 'PARTIAL') {
      if (dueAmount == null) {
        throw new BadRequestException('Enter the remaining dues amount');
      }
      if (dueAmount >= Number(invoice.total)) {
        throw new BadRequestException(
          'Remaining dues must be less than the invoice total. Use "Mark unpaid" if nothing has been paid.',
        );
      }
      return this.prisma.invoice.update({
        where: { id },
        data: { status: InvoiceStatus.ISSUED, dueAmount },
      });
    }

    return this.prisma.invoice.update({
      where: { id },
      data: {
        status: status === 'PAID' ? InvoiceStatus.PAID : InvoiceStatus.ISSUED,
        dueAmount: 0,
      },
    });
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
  async listCosts(vendor?: string, payment?: string) {
    const where: Prisma.InvoiceCostWhereInput = {};
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
      },
      orderBy: { incurredAt: 'desc' },
    });
    return rows.map(({ invoice, ...c }) => ({
      ...c,
      invoiceNo: invoice.invoiceNo,
      customerName: invoice.customer?.name ?? invoice.shipment?.customer.name ?? '',
    }));
  }

  // Same rules as invoice payments: PARTIAL needs the remaining amount, which must be below the cost.
  async setCostPayment(costId: string, status: 'PAID' | 'UNPAID' | 'PARTIAL', dueAmount?: number) {
    const cost = await this.prisma.invoiceCost.findUnique({ where: { id: costId } });
    if (!cost) throw new NotFoundException('Cost not found');
    if (status === 'PARTIAL') {
      if (dueAmount == null) throw new BadRequestException('Enter the remaining dues amount');
      if (dueAmount >= Number(cost.amount)) {
        throw new BadRequestException(
          'Remaining dues must be less than the cost amount. Use "Unpaid" if nothing has been paid.',
        );
      }
      return this.prisma.invoiceCost.update({
        where: { id: costId },
        data: { payment: CostPayment.PARTIAL, dueAmount },
      });
    }
    return this.prisma.invoiceCost.update({
      where: { id: costId },
      data: { payment: status === 'PAID' ? CostPayment.PAID : CostPayment.UNPAID, dueAmount: 0 },
    });
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