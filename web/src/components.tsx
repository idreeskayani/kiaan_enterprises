import { label } from './constants';

export const fmt = (n: number | string) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Badge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{label(status)}</span>;
}

export function Breakdown({ q }: { q: any }) {
  const rows: [string, number][] = [
    [q.freightOverridden ? 'Freight (fixed amount)' : 'Base freight', q.base],
    ['Fuel surcharge', q.fuel],
    ['Handling', q.handling],
    ['DO charges (PKR)', q.doCharges ?? 0],
  ];
  return (
    <div className="card">
      <h3>Charges</h3>
      <p className="muted">
        Actual {q.actualKg} kg · Volumetric {q.volumetricKg} kg · Chargeable {q.chargeableKg} kg ·{' '}
        {q.cbm} CBM
      </p>
      <table>
        <tbody>
          {rows.map(([name, value]) => (
            <tr key={name}>
              <td>{name}</td>
              <td className="num">{fmt(value)}</td>
            </tr>
          ))}
          <tr>
            <td>
              <b>Total freight (including DO charges)</b>
            </td>
            <td className="num">
              <b>{fmt(q.total)}</b>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}