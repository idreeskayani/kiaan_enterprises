import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { fmt } from '../components';
import { STATUSES, label } from '../constants';

export default function Dashboard() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [money, setMoney] = useState<{ invoiced: number; collected: number; outstanding: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/shipments/summary').then(setCounts).catch((e) => setError(e.message));
    api('/invoices/summary').then(setMoney).catch(() => setMoney(null));
  }, []);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <h1>Dashboard</h1>
      {error && <div className="error">{error}</div>}
      <div className="grid">
        <Link to="/shipments" className="stat">
          <span className="muted">All shipments</span>
          <b>{total}</b>
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} to={`/shipments?status=${s}`} className="stat">
            <span className="muted">{label(s)}</span>
            <b>{counts[s] ?? 0}</b>
          </Link>
        ))}
      </div>

      {money && (
        <>
          <h2 style={{ marginTop: 24 }}>Invoices (PKR)</h2>
          <div className="grid">
            <div className="stat">
              <span className="muted">Invoiced</span>
              <b>{fmt(money.invoiced)}</b>
            </div>
            <div className="stat">
              <span className="muted">Collected</span>
              <b>{fmt(money.collected)}</b>
            </div>
            <div className="stat">
              <span className="muted">Outstanding</span>
              <b>{fmt(money.outstanding)}</b>
            </div>
          </div>
        </>
      )}
    </>
  );
}