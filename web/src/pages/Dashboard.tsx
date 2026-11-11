import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { CountUp } from '../components';
import { STATUSES, label } from '../constants';
import { DateRange, useDateRange, withDates } from '../DateRange';

export default function Dashboard() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [money, setMoney] = useState<{ invoiced: number; collected: number; outstanding: number; costs?: number; profit?: number } | null>(null);
  const [error, setError] = useState('');
  const range = useDateRange();

  // reload the figures whenever the dates change
  useEffect(() => {
    if (range.bad) return;
    api(withDates('/shipments/summary', range)).then((r) => { setCounts(r); setError(''); }).catch((e) => setError(e.message));
    api(withDates('/invoices/summary', range)).then(setMoney).catch(() => setMoney(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <h1>Dashboard</h1>
      <DateRange from={range.from} to={range.to} setFrom={range.setFrom} setTo={range.setTo} bad={range.bad} />
      {error && <div className="error">{error}</div>}
      <div className="grid">
        <Link to={withDates('/shipments', range)} className="stat">
          <span className="muted">All shipments</span>
          <b><CountUp value={total} /></b>
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} to={withDates(`/shipments?status=${s}`, range)} className="stat">
            <span className="muted">{label(s)}</span>
            <b><CountUp value={counts[s] ?? 0} /></b>
          </Link>
        ))}
      </div>

      {money && (
        <>
          <h2 style={{ marginTop: 24 }}>Invoices (PKR)</h2>
          <div className="grid">
            <div className="stat">
              <span className="muted">Invoiced</span>
              <b><CountUp value={money.invoiced} money /></b>
            </div>
            <div className="stat">
              <span className="muted">Collected</span>
              <b><CountUp value={money.collected} money /></b>
            </div>
            <div className="stat">
              <span className="muted">Outstanding</span>
              <b><CountUp value={money.outstanding} money /></b>
            </div>
            <div className="stat">
              <span className="muted">Costs (debit)</span>
              <b><CountUp value={money.costs ?? 0} money /></b>
            </div>
            <div className="stat">
              <span className="muted">Net profit</span>
              <b className={(money.profit ?? 0) >= 0 ? 'profit-pos' : 'profit-neg'}><CountUp value={money.profit ?? 0} money /></b>
            </div>
          </div>
        </>
      )}
    </>
  );
}