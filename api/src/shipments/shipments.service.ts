import { Injectable, NotFoundException } from '@nestjs/common';
import { ShipmentStatus } from '@prisma/client';
import type { Mode } from '@prisma/client';
import { PricingService } from '../pricing/pricing.service.js';
import type { PricingRate } from '../pricing/pricing.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateShipmentDto, QuoteDto } from './dto.js';

type ResolveInput = {
  mode: Mode;
  origin: string;
  destination: string;
  rate?: {
    ratePerUnit: number;
    minCharge?: number;
    fuelPct?: number;
    handling?: number;
    volDivisor?: number | null;
  } | null;
  freightOverride?: number | null;
  doCharges?: number | null;
};

@Injectable()
export class ShipmentsService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
  ) {}

  // Works out the rate to use: the user's own values first,
  // then the saved rate card as a fallback.
  private async resolveRate(i: ResolveInput): Promise<PricingRate> {
    const doCharges = i.doCharges ?? 0;

    if (i.rate || i.freightOverride != null) {
      return {
        mode: i.mode,
        ratePerUnit: i.rate?.ratePerUnit ?? 0,
        minCharge: i.rate?.minCharge ?? 0,
        fuelPct: i.rate?.fuelPct ?? 0,
        handling: i.rate?.handling ?? 0,
        volDivisor: i.rate?.volDivisor ?? null,
        freightOverride: i.freightOverride ?? null,
        doCharges,
      };
    }

    const card = await this.prisma.rateCard.findUnique({
      where: {
        mode_origin_destination: {
          mode: i.mode,
          origin: i.origin,
          destination: i.destination,
        },
      },
    });
    if (!card) {
      throw new NotFoundException(
        `No saved rate for ${i.mode} ${i.origin} -> ${i.destination}. Enter a rate or freight amount.`,
      );
    }
    return {
      mode: card.mode,
      ratePerUnit: Number(card.ratePerUnit),
      minCharge: Number(card.minCharge),
      fuelPct: Number(card.fuelPct),
      handling: Number(card.handling),
      doCharges,
    };
  }

  async quote(dto: QuoteDto) {
    const rate = await this.resolveRate(dto);
    return this.pricing.calculate(dto.items, rate, dto.goodsValue, dto.insurance ?? 0, null);
  }

  async create(dto: CreateShipmentDto, userId: string) {
    const rate = await this.resolveRate(dto);
    const refNo = `SH-${Date.now().toString(36).toUpperCase()}`;
    return this.prisma.shipment.create({
      data: {
        refNo,
        customerId: dto.customerId,
        mode: dto.mode,
        origin: dto.origin.trim(),
        destination: dto.destination.trim(),
        viaPoints: (dto.viaPoints ?? []).map((p) => p.trim()).filter(Boolean),
        goodsValue: dto.goodsValue,
        insurance: dto.insurance ?? 0,
        blAwbNo: dto.blAwbNo,
        eta: dto.eta ? new Date(dto.eta) : undefined,
        ratePerUnit: rate.ratePerUnit,
        minCharge: rate.minCharge,
        fuelPct: rate.fuelPct,
        handling: rate.handling,
        volDivisor: rate.volDivisor ?? undefined,
        freightOverride: rate.freightOverride ?? undefined,
        doCharges: rate.doCharges ?? 0,
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

  // Re-prices a saved shipment from the rate stored on it.
  async quoteForShipment(id: string) {
    const s = await this.findOne(id);
    const rate = await this.resolveRate({
      mode: s.mode,
      origin: s.origin,
      destination: s.destination,
      rate:
        s.ratePerUnit !== null
          ? {
              ratePerUnit: Number(s.ratePerUnit),
              minCharge: Number(s.minCharge ?? 0),
              fuelPct: Number(s.fuelPct ?? 0),
              handling: Number(s.handling ?? 0),
              volDivisor: s.volDivisor,
            }
          : null,
      freightOverride: s.freightOverride !== null ? Number(s.freightOverride) : null,
      doCharges: s.doCharges !== null ? Number(s.doCharges) : 0,
    });
    return this.pricing.calculate(
      s.items.map((i) => ({
        lengthCm: Number(i.lengthCm),
        widthCm: Number(i.widthCm),
        heightCm: Number(i.heightCm),
        weightKg: Number(i.weightKg),
        qty: i.qty,
      })),
      rate,
      Number(s.goodsValue),
      Number(s.insurance),
      null,
    );
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

  async summary() {
    const rows = await this.prisma.shipment.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  }
}