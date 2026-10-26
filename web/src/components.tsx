import { label } from './constants';

export const fmt = (n: number | string) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Badge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{label(status)}</span>;
}

export function Breakdown({ q }: { q: any }) {
  return (
    <div className="card">
      <h3>Invoice charges</h3>
      <p className="muted">
        Actual {q.actualKg} kg · Volumetric {q.volumetricKg} kg · Chargeable {q.chargeableKg} kg ·{' '}
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