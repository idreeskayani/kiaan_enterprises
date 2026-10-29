import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuotationStatus, ShipmentStatus } from '@prisma/client';
import { buildInvoicePdf } from '../invoices/invoice-pdf.js';
import type { PdfInvoice } from '../invoices/invoice-pdf.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateShipmentDto } from '../shipments/dto.js';
import { ShipmentsService } from '../shipments/shipments.service.js';
import type { CreateQuotationDto } from './dto.js';

const VALID_DAYS = 7;
const addDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
};

@Injectable()
export class QuotationsService {
  constructor(
    private prisma: PrismaService,
    private shipments: ShipmentsService,
  ) {}

  private async nextQuoteNo() {
    const prefix = `QT-${new Date().getFullYear()}-`;
    const last = await this.prisma.quotation.findFirst({
      where: { quoteNo: { startsWith: prefix } },
      orderBy: { quoteNo: 'desc' },
      select: { quoteNo: true },
    });
    const n = last ? Number(last.quoteNo.slice(prefix.length)) || 0 : 0;
    return `${prefix}${String(n + 1).padStart(5, '0')}`;
  }

  // Sent quotations past their date become EXPIRED. Drafts never expire.
  private expireOld() {
    return this.prisma.quotation.updateMany({
      where: { status: QuotationStatus.SENT, validUntil: { lt: new Date() } },
      data: { status: QuotationStatus.EXPIRED },
    });
  }

  // New quotations are always saved as DRAFT. "Send" is a separate step.
  async create(dto: CreateQuotationDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    // prices it with the same rules as a shipment, so bad rates/exchange rates fail here
    const q = await this.shipments.quote(dto);

    const { validDays, ...payload } = dto;

    return this.prisma.quotation.create({
      data: {
        quoteNo: await this.nextQuoteNo(),
        customerId: dto.customerId,
        payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
        total: q.total,
        validUntil: addDays(validDays ?? VALID_DAYS),
        status: QuotationStatus.DRAFT,
      },
      include: { customer: true },
    });
  }

  async list(status?: QuotationStatus) {
    await this.expireOld();
    return this.prisma.quotation.findMany({
      where: status ? { status } : undefined,
      include: { customer: { select: { name: true } }, shipment: { select: { id: true, refNo: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    await this.expireOld();
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { customer: true, shipment: { select: { id: true, refNo: true } } },
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    return quotation;
  }

  // Marks the quotation as sent. The validity period starts from the day it is sent.
  async send(id: string) {
    const quotation = await this.findOne(id);
    if (quotation.status === QuotationStatus.SENT) return quotation;
    if (quotation.status !== QuotationStatus.DRAFT) {
      throw new ConflictException(`A ${quotation.status.toLowerCase()} quotation cannot be sent`);
    }
    return this.prisma.quotation.update({
      where: { id },
      data: { status: QuotationStatus.SENT, validUntil: addDays(VALID_DAYS) },
    });
  }

  // Client agreed: creates a DRAFT shipment from the quotation. It is booked from the shipment page.
  async accept(id: string, userId: string) {
    const quotation = await this.findOne(id);
    if (quotation.status === QuotationStatus.EXPIRED) {
      throw new ConflictException('This quotation has expired. Create a new one.');
    }
    if (quotation.status !== QuotationStatus.SENT && quotation.status !== QuotationStatus.DRAFT) {
      throw new ConflictException(`Quotation is already ${quotation.status.toLowerCase()}`);
    }
    const before = quotation.status;

    // claim it first so a double click cannot book two shipments
    const claimed = await this.prisma.quotation.updateMany({
      where: { id, status: before },
      data: { status: QuotationStatus.ACCEPTED },
    });
    if (claimed.count === 0) throw new ConflictException('Quotation was already handled');

    try {
      const shipment = await this.shipments.create(
        quotation.payload as unknown as CreateShipmentDto,
        userId,
        ShipmentStatus.DRAFT, // booked later with "Create shipment" on the shipment page
      );
      await this.prisma.quotation.update({
        where: { id },
        data: { shipmentId: shipment.id },
      });
      return { quotationId: id, shipment };
    } catch (e) {
      await this.prisma.quotation.update({ where: { id }, data: { status: before } });
      throw e;
    }
  }

  async reject(id: string) {
    const quotation = await this.findOne(id);
    if (quotation.status !== QuotationStatus.SENT && quotation.status !== QuotationStatus.DRAFT) {
      throw new BadRequestException('Only a draft or sent quotation can be rejected');
    }
    return this.prisma.quotation.update({
      where: { id },
      data: { status: QuotationStatus.REJECTED },
    });
  }

  // Any quotation can be deleted. A shipment booked from it is not touched.
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.quotation.delete({ where: { id } });
    return { deleted: true };
  }

  // Edit a draft or sent quotation. Accepted ones already created a shipment.
  async update(id: string, dto: CreateQuotationDto) {
    const quotation = await this.findOne(id);
    if (quotation.status !== QuotationStatus.DRAFT && quotation.status !== QuotationStatus.SENT) {
      throw new ConflictException(`A ${quotation.status.toLowerCase()} quotation cannot be edited`);
    }
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    const q = await this.shipments.quote(dto);
    const { validDays, ...payload } = dto;

    return this.prisma.quotation.update({
      where: { id },
      data: {
        customerId: dto.customerId,
        payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
        total: q.total,
        ...(validDays ? { validUntil: addDays(validDays) } : {}),
      },
      include: { customer: true },
    });
  }

  // Charge breakdown for the detail screen.
  async breakdown(id: string) {
    const quotation = await this.findOne(id);
    return this.shipments.quote(quotation.payload as unknown as CreateShipmentDto);
  }

  // ---- PDF (same letterhead layout as the invoice, titled QUOTATION)
  private async buildPdf(
    payload: CreateShipmentDto,
    meta: { quoteNo: string; issuedAt: Date; validUntil: Date },
  ) {
    const customer = await this.prisma.customer.findUnique({ where: { id: payload.customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    const q = await this.shipments.quote(payload);
    const inv: PdfInvoice = {
      kind: 'quotation',
      invoiceNo: meta.quoteNo,
      status: 'QUOTATION',
      issuedAt: meta.issuedAt,
      validUntil: meta.validUntil,
      total: q.total,
      lines: q.lines.map((l) => ({
        label: l.label,
        amount: l.pkr,
        currency: l.currency,
        foreignAmount: l.foreign,
        exRate: l.rate,
      })),
      shipment: {
        refNo: meta.quoteNo,
        mode: payload.mode,
        origin: payload.origin.trim(),
        destination: payload.destination.trim(),
        viaPoints: (payload.viaPoints ?? []).map((p) => p.trim()).filter(Boolean),
        blAwbNo: payload.blAwbNo ?? null,
        hawbNo: payload.hawbNo ?? null,
        flight: payload.flight ?? null,
        eta: payload.eta ?? null,
        volDivisor: payload.rate?.volDivisor ?? null,
        exRate: q.exRate,
        details: payload.details ?? null,
        items: payload.items,
        customer: {
          name: customer.name,
          address: customer.address,
          phone: customer.phone,
          taxNumber: customer.taxNumber,
        },
      },
    };
    return buildInvoicePdf(inv);
  }

  async pdf(id: string) {
    const qt = await this.findOne(id);
    const buffer = await this.buildPdf(qt.payload as unknown as CreateShipmentDto, {
      quoteNo: qt.quoteNo,
      issuedAt: qt.createdAt,
      validUntil: qt.validUntil,
    });
    return { buffer, filename: `${qt.quoteNo}.pdf` };
  }

  // Preview from the form data. Nothing is saved.
  async preview(dto: CreateShipmentDto) {
    const buffer = await this.buildPdf(dto, {
      quoteNo: 'DRAFT',
      issuedAt: new Date(),
      validUntil: addDays(VALID_DAYS),
    });
    return { buffer, filename: 'quotation-preview.pdf' };
  }
}