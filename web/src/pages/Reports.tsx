import { useEffect, useState } from 'react';
import { api, downloadPath, getUser, openPdfPath } from '../api';

type Period = 'day' | 'week' | 'month' | 'year';
const PERIODS: [Period, string][] = [
  ['day', 'Daily'],
  ['week', 'Weekly'],
  ['month', 'Monthly'],
  ['year', 'Yearly'],
];

type Row = {
  key: string; label: string; invoices: number; invoiced: number; cash: number; cheque: number;
  online: number; received: number; remaining: number; profit: number | null;
};
type Report = { from: string; to: string; rows: Row[]; totals: Omit<Row, 'key' | 'label'> };

// whole rupees: this page is for reading across
const rs = (n: number | null) => (n == null ? '' : Math.round(n).toLocaleString('en-US'));

// Daily / weekly / monthly / yearly figures. Clearance staff see the clearance numbers, everyone else freight.
export default function Reports() {
  const section = getUser()?.role === 'CLEARING_AGENT' ? 'clearance' : 'freight';
  const [period, setPeriod] = useState<Period>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [customer, setCustomer] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState('');

  const qs = (extra = '') => {
    const p = new URLSearchParams({ period });
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (customer.trim()) p.set('customer', customer.trim());
    return `?${p.toString()}${extra}`;
  };

  useEffect(() => {
    const load = section === 'clearance'
      ? api<string[]>('/clearance/customers')
      : api<{ name: string }[]>('/customers').then((l) => l.map((c) => c.name));
    load.then(setNames).catch(() => setNames([]));
  }, [section]);

  // the report is loaded again whenever a filter changes (typing in the customer box waits a moment)
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api<Report>(`/reports/${section}${qs()}`)
        .then((r) => {
          if (!alive) return;
          setData(r);
          setError('');
        })
        .catch((e) => alive && setError((e as Error).message));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, period, from, to, customer]);

  async function viewPdf() {
    setError('');
    const win = window.open('', '_blank');
    try {
      await openPdfPath(`/reports/${section}/pdf${qs()}`, win);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function downloadCsv() {
    setError('');
    try {
      await downloadPath(`/reports/${section}/csv${qs()}`, `${period}-report-${data?.from ?? ''}-to-${data?.to ?? ''}.csv`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const hasProfit = data?.totals.profit != null;

  return (
    <>
      <div className="row" style={{ alignItems: 'center' }}>
        <h2 style={{ flex: 3, margin: 0 }}>Reports</h2>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {PERIODS.map(([p, name]) => (
            <button
              key={p}
              type="button"
              className={period === p ? '' : 'ghost'}
              onClick={() => {
                setPeriod(p);
                setFrom('');
                setTo('');
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="row">
          <div>
            <label>From</label>
            <input type="date" value={from || data?.from || ''} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label>To</label>
            <input type="date" value={to || data?.to || ''} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div style={{ flex: 2 }}>
            <label>Customer (leave empty for all)</label>
            <input
              list="report-customers"
              value={customer}
              placeholder="All customers"
              onChange={(e) => setCustomer(e.target.value)}
            />
            <datalist id="report-customers">
              {names.map((n) => <option key={n} value={n} />)}
            </datalist>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <button type="button" className="ghost" disabled={!data} onClick={viewPdf}>View PDF</button>
          <button type="button" className="ghost" disabled={!data} onClick={downloadCsv}>Download for Excel (CSV)</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {data && (
        <>
          <div className="card" style={{ display: 'flex', gap: 36, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <div className="muted">Invoiced</div>
              <b style={{ fontSize: 22 }}>PKR {rs(data.totals.invoiced)}</b>
            </div>
            <div>
              <div className="muted">Received</div>
              <b style={{ fontSize: 22 }}>PKR {rs(data.totals.received)}</b>
            </div>
            <div>
              <div className="muted">Remaining dues</div>
              <b style={{ fontSize: 22 }}>PKR {rs(data.totals.remaining)}</b>
            </div>
            {hasProfit && (
              <div>
                <div className="muted">Profit</div>
                <b style={{ fontSize: 22 }} className={(data.totals.profit ?? 0) >= 0 ? 'profit-pos' : 'profit-neg'}>
                  PKR {rs(data.totals.profit)}
                </b>
              </div>
            )}
          </div>

          <div className="card" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th className="num">Invoices</th>
                  <th className="num">Invoiced</th>
                  <th className="num">Cash</th>
                  <th className="num">Cheque</th>
                  <th className="num">Online</th>
                  <th className="num">Received</th>
                  <th className="num">Remaining dues</th>
                  {hasProfit && <th className="num">Profit</th>}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.label}</td>
                    <td className="num">{r.invoices}</td>
                    <td className="num">{rs(r.invoiced)}</td>
                    <td className="num">{rs(r.cash)}</td>
                    <td className="num">{rs(r.cheque)}</td>
                    <td className="num">{rs(r.online)}</td>
                    <td className="num"><b>{rs(r.received)}</b></td>
                    <td className="num">{rs(r.remaining)}</td>
                    {hasProfit && <td className="num">{rs(r.profit)}</td>}
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr><td colSpan={hasProfit ? 9 : 8} className="muted">No invoices or payments in this period.</td></tr>
                )}
                {data.rows.length > 0 && (
                  <tr>
                    <td><b>Total</b></td>
                    <td className="num"><b>{data.totals.invoices}</b></td>
                    <td className="num"><b>{rs(data.totals.invoiced)}</b></td>
                    <td className="num"><b>{rs(data.totals.cash)}</b></td>
                    <td className="num"><b>{rs(data.totals.cheque)}</b></td>
                    <td className="num"><b>{rs(data.totals.online)}</b></td>
                    <td className="num"><b>{rs(data.totals.received)}</b></td>
                    <td className="num"><b>{rs(data.totals.remaining)}</b></td>
                    {hasProfit && <td className="num"><b>{rs(data.totals.profit)}</b></td>}
                  </tr>
                )}
              </tbody>
            </table>
            <p className="muted" style={{ marginTop: 12 }}>
              Invoiced = invoices made in the period. Received = money received in the period (by the date it came in).
              Remaining dues = still unpaid on the invoices made in the period.
            </p>
          </div>
        </>
      )}
    </>
  );
}
