import { Injectable } from '@nestjs/common';

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
  doCharges?: number | null;
  volDivisor?: number | null;
  freightOverride?: number | null;
};

export type PricingHs = { dutyPct: number; salesTaxPct: number; whtPct: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class PricingService {
  calculate(
    items: PricingItem[],
    rate: PricingRate,
    goodsValue: number,
    insurance: number,
    hs?: PricingHs | null,
  ) {
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
    const doCharges = rate.doCharges ?? 0; // delivery order charges (PKR), always added
    const freight = base + fuel + handling + doCharges;

    const cif = goodsValue + freight + insurance;
    const duty = hs ? (cif * hs.dutyPct) / 100 : 0;
    const salesTax = hs ? ((cif + duty) * hs.salesTaxPct) / 100 : 0;
    const wht = hs ? ((cif + duty + salesTax) * hs.whtPct) / 100 : 0;

    return {
      actualKg: r2(actualKg),
      volumetricKg: r2(volKg),
      cbm: r2(cbm),
      chargeableKg: r2(chargeableKg),
      freightOverridden: overridden,
      base: r2(base),
      fuel: r2(fuel),
      handling: r2(handling),
      doCharges: r2(doCharges),
      freight: r2(freight),
      cif: r2(cif),
      duty: r2(duty),
      salesTax: r2(salesTax),
      wht: r2(wht),
      total: r2(freight + duty + salesTax + wht),
    };
  }
}