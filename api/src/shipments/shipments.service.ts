import { Injectable, NotFoundException } from '@nestjs/common';
import { ShipmentStatus } from '@prisma/client';
import type { Mode, Prisma } from '@prisma/client';
import { PricingService } from '../pricing/pricing.service.js';
import type { ChargeOptions, PricingRate } from '../pricing/pricing.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateShipmentDto, QuoteDto } from './dto.js';

const DETAIL_KEYS = [
  'direction', 'airline', 'shipper', 'commodity', 'custRef', 'etd',
  'mawbDate', 'hawbDate', 'doNo', 'doDate', 'igmNo', 'igmDate', 'beNo', 'beDate',
];

type StoredExtra = {
  label: string;
  amount: number;
  currency?: string;
  exRate?: number | null;
  pkr?: boolean; // older shipments
};

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
};

@Injectable()
export class ShipmentsService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
  ) {}

  // The user's own rate first, then the saved rate card as a fallback.
  private async resolveRate(i: ResolveInput): Promise<PricingRate> {
    if (i.rate || i.freightOverride != null) {
      return {
        mode: i.mode,
        ratePerUnit: i.rate?.ratePerUnit ?? 0,
        minCharge: i.rate?.minCharge ?? 0,
        fuelPct: i.rate?.fuelPct ?? 0,
        handling: i.rate?.handling ?? 0,
        volDivisor: i.rate?.volDivisor ?? null,
        freightOverride: i.freightOverride ?? null,
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
    };
  }

  private chargeOpts(dto: QuoteDto): ChargeOptions {
    const main = (dto.currency ?? 'USD').toUpperCase();
    return {
      currency: main,
      exRate: dto.exRate ?? null,
      doCharges: dto.doCharges ?? 0,
      extras: (dto.extraCharges ?? []).map((e) => {
        const cur = (e.currency ?? main).toUpperCase();
        return {
          label: e.label,
          amount: e.amount,
          currency: cur,
          exRate:
            cur === 'PKR' ? null : (e.exRate ?? (cur === main ? (dto.exRate ?? null) : null)),
        };
      }),
      freightLabel: dto.freightLabel ?? null,
    };
  }

  private cleanDetails(d?: Record<string, unknown> | null) {
    const out: Record<string, string> = {};
    for (const k of DETAIL_KEYS) {
      const v = d?.[k];
      if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 200);
    }
    return out;
  }

  async quote(dto: QuoteDto) {
    const rate = await this.resolveRate(dto);
    return this.pricing.calculate(dto.items, rate, this.chargeOpts(dto));
  }

  async create(dto: CreateShipmentDto, userId: string) {
    const rate = await this.resolveRate(dto);
    const opts = this.chargeOpts(dto);
    // checks the exchange rates and amounts before anything is saved
    this.pricing.calculate(dto.items, rate, opts);

    const refNo = `SH-${Date.now().toString(36).toUpperCase()}`;
    return this.prisma.shipment.create({
      data: {
        refNo,
        customerId: dto.customerId,
        mode: dto.mode,
        origin: dto.origin.trim(),
        destination: dto.destination.trim(),
        viaPoints: (dto.viaPoints ?? []).map((p) => p.trim()).filter(Boolean),
        goodsValue: dto.goodsValue ?? 0,
        blAwbNo: dto.blAwbNo,
        hawbNo: dto.hawbNo,
        flight: dto.flight,
        eta: dto.eta ? new Date(dto.eta) : undefined,
        ratePerUnit: rate.ratePerUnit,
        minCharge: rate.minCharge,
        fuelPct: rate.fuelPct,
        handling: rate.handling,
        volDivisor: rate.volDivisor ?? undefined,
        freightOverride: rate.freightOverride ?? undefined,
        doCharges: opts.doCharges,
        freightLabel: opts.freightLabel ?? undefined,
        currency: opts.currency,
        exRate: opts.currency === 'PKR' ? undefined : (opts.exRate ?? undefined),
        extraCharges: opts.extras as unknown as Prisma.InputJsonValue,
        details: this.cleanDetails(dto.details) as Prisma.InputJsonValue,
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

  // Re-prices a saved shipment from the values stored on it.
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
    });

    // shipments created before exchange rates existed are treated as PKR
    const pkrMode = s.exRate === null;
    const main = pkrMode ? 'PKR' : s.currency;
    const stored = (Array.isArray(s.extraCharges) ? s.extraCharges : []) as unknown as StoredExtra[];
    const extras = stored.map((e) => ({
      label: e.label,
      amount: e.amount,
      currency: (e.currency ?? (e.pkr ? 'PKR' : main)).toUpperCase(),
      exRate: e.exRate ?? null,
    }));

    return this.pricing.calculate(
      s.items.map((i) => ({
        lengthCm: Number(i.lengthCm),
        widthCm: Number(i.widthCm),
        heightCm: Number(i.heightCm),
        weightKg: Number(i.weightKg),
        qty: i.qty,
      })),
      rate,
      {
        currency: main,
        exRate: s.exRate !== null ? Number(s.exRate) : null,
        doCharges: s.doCharges !== null ? Number(s.doCharges) : 0,
        extras,
        freightLabel: s.freightLabel,
      },
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