import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ShipmentsService } from '../shipments/shipments.service.js';
import { buildInvoicePdf } from './invoice-pdf.js';

const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private shipments: ShipmentsService,
  ) {}

  async createForShipment(shipmentId: string) {
    const shipment = await this.shipments.findOne(shipmentId);
    if (shipment.invoice) throw new ConflictException('Invoice already exists for this shipment');
    if (shipment.status === ShipmentStatus.CANCELLED) {
      throw new ConflictException('Cannot invoice a cancelled shipment');
    }

    const q = await this.shipments.quoteForShipment(shipmentId);
    const freightLabel =
      shipment.mode === 'SEA'
        ? `Freight (${q.cbm} CBM)`
        : `Freight (${q.chargeableKg} kg chargeable)`;

    const lines = [
      { label: freightLabel, amount: q.base },
      { label: 'Fuel surcharge', amount: q.fuel },
      { label: 'Handling', amount: q.handling },
      { label: 'Customs duty', amount: q.duty },
      { label: 'Sales tax', amount: q.salesTax },
      { label: 'Withholding tax', amount: q.wht },
    ].filter((l) => l.amount > 0);

    const total = r2(lines.reduce((s, l) => s + l.amount, 0));
    const count = await this.prisma.invoice.count();
    const invoiceNo = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    return this.prisma.invoice.create({
      data: { invoiceNo, shipmentId, total, lines: { create: lines } },
      include: { lines: true },
    });
  }

  list(status?: InvoiceStatus) {
    return this.prisma.invoice.findMany({
      where: status ? { status } : undefined,
      include: { shipment: { select: { refNo: true, customer: { select: { name: true } } } } },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { lines: true, shipment: { include: { customer: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async updateStatus(id: string, status: InvoiceStatus) {
    await this.findOne(id);
    return this.prisma.invoice.update({ where: { id }, data: { status } });
  }

  async pdf(id: string) {
    const invoice = await this.findOne(id);
    const buffer = await buildInvoicePdf(invoice);
    return { buffer, filename: `${invoice.invoiceNo}.pdf` };
  }
}
