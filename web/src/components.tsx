import { useEffect, useState } from 'react';
import { label } from './constants';

export const fmt = (n: number | string) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Badge({ status }: { status?: string | null }) {
  if (!status) return null; // e.g. a job with no invoice has no payment status
  return <span className={`badge ${status}`}>{label(status)}</span>;
}

export function Breakdown({ q }: { q: any }) {
  return (
    <div className="card">
      <h3>Invoice charges</h3>
      <p className="muted">
        Gross {q.grossKg ?? q.actualKg} kg · Volumetric {q.volumetricKg} kg · Chargeable {q.chargeableKg} kg ·{' '}
        Billed on {q.billableKg ?? q.chargeableKg} kg ·{' '}
        {q.cbm} CBM
      </p>
      <table>
        <thead>
          <tr>
            <th>Particulars</th>
            <th>Curr</th>
            <th className="num">F/Amount</th>
            <th className="num">Ex. rate</th>
            <th className="num">Amount (PKR)</th>
          </tr>
        </thead>
        <tbody>
          {q.lines.map((l: any, i: number) => (
            <tr key={i}>
              <td>{l.label}</td>
              <td>{l.currency ?? 'PKR'}</td>
              <td className="num">{l.foreign != null ? fmt(l.foreign) : ''}</td>
              <td className="num">{l.rate ? Number(l.rate) : ''}</td>
              <td className="num">{fmt(l.pkr)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={4}><b>TOTAL</b></td>
            <td className="num"><b>PKR {fmt(q.total)}</b></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// number that counts up from 0 when it appears
export function CountUp({ value, money = false }: { value: number | string; money?: boolean }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const target = Number(value) || 0;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 1 : 900;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{money ? fmt(v) : Math.round(v)}</>;
}
