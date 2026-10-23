import { Injectable, NotFoundException } from '@nestjs/common';
import { ShipmentStatus } from '@prisma/client';
import { PricingService } from '../pricing/pricing.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateShipmentDto, QuoteDto } from './dto.js';

@Injectable()
export class ShipmentsService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
  ) {}

  async quote(dto: QuoteDto) {
    const rate = await this.prisma.rateCard.findUnique({
      where: {
        mode_origin_destination: {
          mode: dto.mode,
          origin: dto.origin,
          destination: dto.destination,
        },
      },
    });
    if (!rate) {
      throw new NotFoundException(
        `No rate card for ${dto.mode} ${dto.origin} -> ${dto.destination}`,
      );
    }
    const hs = dto.hsCodeId
      ? await this.prisma.hsCode.findUnique({ where: { id: dto.hsCodeId } })
      : null;

    return this.pricing.calculate(
      dto.items,
      {
        mode: rate.mode,
        ratePerUnit: Number(rate.ratePerUnit),
        minCharge: Number(rate.minCharge),
        fuelPct: Number(rate.fuelPct),
        handling: Number(rate.handling),
      },
      dto.goodsValue,
      dto.insurance ?? 0,
      hs && {
        dutyPct: Number(hs.dutyPct),
        salesTaxPct: Number(hs.salesTaxPct),
        whtPct: Number(hs.whtPct),
      },
    );
  }

  create(dto: CreateShipmentDto, userId: string) {
    const refNo = `SH-${Date.now().toString(36).toUpperCase()}`;
    return this.prisma.shipment.create({
      data: {
        refNo,
        customerId: dto.customerId,
        mode: dto.mode,
        origin: dto.origin,
        destination: dto.destination,
        hsCodeId: dto.hsCodeId,
        goodsValue: dto.goodsValue,
        insurance: dto.insurance ?? 0,
        blAwbNo: dto.blAwbNo,
        eta: dto.eta ? new Date(dto.eta) : undefined,
        items: { create: dto.items },
        history: {
          create: { status: ShipmentStatus.BOOKED, note: 'Shipment booked', userId },
        },
      },
      include: { items: true, customer: true },
    });
  }

  list(status?: ShipmentStatus) {
    return this.prisma.shipment.findMany({
      where: status ? { status } : undefined,
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: {
        customer: true,
        hsCode: true,
        items: true,
        invoice: { include: { lines: true } },
        history: { orderBy: { at: 'asc' }, include: { user: { select: { email: true } } } },
      },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    return shipment;
  }

  async quoteForShipment(id: string) {
    const s = await this.findOne(id);
    return this.quote({
      mode: s.mode,
      origin: s.origin,
      destination: s.destination,
      hsCodeId: s.hsCodeId ?? undefined,
      goodsValue: Number(s.goodsValue),
      insurance: Number(s.insurance),
      items: s.items.map((i) => ({
        lengthCm: Number(i.lengthCm),
        widthCm: Number(i.widthCm),
        heightCm: Number(i.heightCm),
        weightKg: Number(i.weightKg),
        qty: i.qty,
      })),
    });
  }

  async updateStatus(id: string, status: ShipmentStatus, note: string | undefined, userId: string) {
    await this.findOne(id);
    const [shipment] = await this.prisma.$transaction([
      this.prisma.shipment.update({ where: { id }, data: { status } }),
      this.prisma.statusHistory.create({
        data: { shipmentId: id, status, note, userId },
      }),
    ]);
    return shipment;
  }

  // Dashboard counts per status
  async summary() {
    const rows = await this.prisma.shipment.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  }
}
