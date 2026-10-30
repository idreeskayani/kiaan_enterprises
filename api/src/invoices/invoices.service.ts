import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateShipmentDto } from '../shipments/dto.js';
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
        },
        orderBy: { issuedAt: 'desc' },
      })
      .then((rows) =>
        rows.map((r) => ({ ...r, customerName: r.customer?.name ?? r.shipment?.customer.name ?? '' })),
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