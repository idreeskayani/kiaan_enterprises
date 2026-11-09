// One place for the gross / chargeable weight rules, used by pricing and by the invoice PDF.
//
// - Gross weight: typed on the form; if left empty it is the sum of (package weight x qty).
// - Chargeable weight: typed on the form; if left empty it is the greater of gross and the
//   volumetric weight worked out from the package sizes (the old behaviour).
// - Freight is charged per kg on whichever of the two is GREATER.

export type WeightItem = {
  lengthCm?: number | string | null;
  widthCm?: number | string | null;
  heightCm?: number | string | null;
  weightKg?: number | string | null;
  qty: number;
};

export type ManualWeights = {
  grossKg?: number | string | null;
  chargeableKg?: number | string | null;
};

const n = (v: unknown) => Number(v) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

export function defaultDivisor(mode: string, volDivisor?: number | null) {
  return volDivisor && volDivisor > 0 ? volDivisor : mode === 'ROAD' ? 4000 : 5000;
}

export function computeWeights(
  items: WeightItem[],
  mode: string,
  volDivisor?: number | null,
  manual?: ManualWeights | null,
) {
  const div = defaultDivisor(mode, volDivisor);
  const pieces = items.reduce((s, i) => s + n(i.qty), 0);
  const itemsGrossKg = items.reduce((s, i) => s + n(i.weightKg) * n(i.qty), 0);
  const volKg = items.reduce(
    (s, i) => s + ((n(i.lengthCm) * n(i.widthCm) * n(i.heightCm)) / div) * n(i.qty),
    0,
  );
  const cbm = items.reduce(
    (s, i) => s + ((n(i.lengthCm) * n(i.widthCm) * n(i.heightCm)) / 1_000_000) * n(i.qty),
    0,
  );

  const grossKg = n(manual?.grossKg) > 0 ? n(manual?.grossKg) : itemsGrossKg;
  const chargeableKg = n(manual?.chargeableKg) > 0 ? n(manual?.chargeableKg) : Math.max(grossKg, volKg);
  // the weight the per-kg rate is multiplied with
  const billableKg = Math.max(grossKg, chargeableKg);

  return {
    pieces,
    grossKg: r2(grossKg),
    volumetricKg: r2(volKg),
    chargeableKg: r2(chargeableKg),
    billableKg: r2(billableKg),
    cbm: r2(cbm),
  };
}
