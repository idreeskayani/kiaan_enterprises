import { BadRequestException, Injectable } from '@nestjs/common';

export type PricingItem = {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  qty: number;
};

export type PricingRate = {
  mode: 'AIR' | 'SEA' | 'ROAD';
  ratePerUnit: number;
  minCharge: number;
  fuelPct: number;
  handling: number;
  volDivisor?: number | null;
  freightOverride?: number | null;
};

export type ExtraCharge = {
  label: string;
  amount: number;
  currency: string;
  exRate?: number | null;
};

export type ChargeOptions = {
  currency: string; // shipment (freight) currency, e.g. GBP, or PKR
  exRate: number | null; // PKR per 1 unit of that currency
  doCharges: number; // PKR
  extras: ExtraCharge[];
  freightLabel?: string | null;
};

export type PricedLine = {
  label: string;
  currency: string | null; // null = PKR
  foreign: number | null;
  rate: number | null;
  pkr: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const FREIGHT_LABEL = { AIR: 'Air Freight', SEA: 'Sea Freight', ROAD: 'Road Freight' };

@Injectable()
export class PricingService {
  calculate(items: PricingItem[], rate: PricingRate, opts: ChargeOptions) {
    const divisor =
      rate.volDivisor && rate.volDivisor > 0
        ? rate.volDivisor
        : rate.mode === 'ROAD'
          ? 4000
          : 5000;

    const actualKg = items.reduce((s, i) => s + i.weightKg * i.qty, 0);
    const volKg = items.reduce(
      (s, i) => s + ((i.lengthCm * i.widthCm * i.heightCm) / divisor) * i.qty,
      0,
    );
    const cbm = items.reduce(
      (s, i) => s + ((i.lengthCm * i.widthCm * i.heightCm) / 1_000_000) * i.qty,
      0,
    );

    const chargeableKg = Math.max(actualKg, volKg);
    const units = rate.mode === 'SEA' ? cbm : chargeableKg;

    const overridden = rate.freightOverride != null;
    const base = overridden
      ? (rate.freightOverride as number)
      : Math.max(units * rate.ratePerUnit, rate.minCharge);
    const fuel = overridden ? 0 : (base * rate.fuelPct) / 100;
    const handling = overridden ? 0 : rate.handling;

    const isPkr = opts.currency === 'PKR';
    const ex = isPkr ? 1 : (opts.exRate ?? 0);
    if (!isPkr && base + fuel + handling > 0 && !(ex > 0)) {
      throw new BadRequestException(`Enter the exchange rate (PKR per 1 ${opts.currency})`);
    }

    const lines: PricedLine[] = [];
    const mainLine = (label: string, amount: number) => {
      if (isPkr) {
        lines.push({ label, currency: null, foreign: null, rate: null, pkr: r2(amount) });
      } else {
        lines.push({
          label,
          currency: opts.currency,
          foreign: r2(amount),
          rate: ex,
          pkr: r2(amount * ex),
        });
      }
    };

    mainLine(
      opts.freightLabel?.trim() || (overridden ? 'Freight' : FREIGHT_LABEL[rate.mode]),
      base,
    );
    if (fuel > 0) mainLine('Fuel surcharge', fuel);
    if (handling > 0) mainLine('Handling charges', handling);

    for (const e of opts.extras) {
      if (e.amount <= 0) continue;
      const cur = e.currency.toUpperCase();
      if (cur === 'PKR') {
        lines.push({ label: e.label, currency: null, foreign: null, rate: null, pkr: r2(e.amount) });
        continue;
      }
      const rateForLine = e.exRate ?? (cur === opts.currency ? opts.exRate : null);
      if (!(rateForLine && rateForLine > 0)) {
        throw new BadRequestException(`Enter the exchange rate for ${cur}`);
      }
      lines.push({
        label: e.label,
        currency: cur,
        foreign: r2(e.amount),
        rate: rateForLine,
        pkr: r2(e.amount * rateForLine),
      });
    }

    if (opts.doCharges > 0) {
      lines.push({ label: 'D/O Charges', currency: null, foreign: null, rate: null, pkr: r2(opts.doCharges) });
    }

    return {
      actualKg: r2(actualKg),
      volumetricKg: r2(volKg),
      cbm: r2(cbm),
      chargeableKg: r2(chargeableKg),
      freightOverridden: overridden,
      currency: opts.currency,
      exRate: isPkr ? null : ex,
      lines,
      total: r2(lines.reduce((s, l) => s + l.pkr, 0)),
    };
  }
}