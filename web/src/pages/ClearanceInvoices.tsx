import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, openClearancePdf } from '../api';
import { Badge, fmt } from '../components';
import { PAYMENT_STATES, label } from '../constants';

export default function ClearanceInvoices() {
  const [sp] = useSearchParams();
  const [payment, setPayment] = useState(sp.get('payment') ?? '');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ scope: 'invoiced' });
      if (payment) qs.set('payment', payment);
      if (q.trim()) qs.set('q', q.trim());
      api(`/clearance?${qs.toString()}`)
        .then((r) => {
          setRows(r);
          setError('');
        })
        .catch((e) => setError(e.message));
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [payment, q]);

  async function view(id: string) {
    // open the tab on click so the browser does not block it
    const win = window.open('', '_blank');
    try {
      await openClearancePdf(id, win);
    } catch (e) {
      win?.close();
      setError((e as Error).message);
    }
  }

  const due = (r: any) =>
    r.payment === 'PAID' ? 0 : r.payment === 'PARTIAL' ? Number(r.dueAmount) : Number(r.total);
  const totalAmount = rows.reduce((s, r) => s + Number(r.total), 0);
  const totalDue = rows.reduce((s, r) => s + due(r), 0);

  return (
    <>
      <h1>Clearance invoices</h1>
      {error && <div className="error">{error}</div>}

      <div className="row" style={{ marginBottom: 14 }}>
        <div style={{ flex: 3 }}>
          <input type="search" placeholder="Search invoice, job, customer or GD no" value={q}
            onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <select value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="">All payments</option>
            {PAYMENT_STATES.filter((s) => s !== 'UNINVOICED').map((s) => (
              <option key={s} value={s}>{label(s)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Job</th>
              <th>Payment</th>
              <th className="num">Total (PKR)</th>
              <th className="num">Due (PKR)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/clearance/jobs/${r.id}`}>{r.invoiceNo}</Link></td>
                <td>{r.invoicedAt ? new Date(r.invoicedAt).toLocaleDateString('en-GB') : '-'}</td>
                <td>{r.customerName}</td>
                <td>{r.jobNo}</td>
                <td><Badge status={r.payment} /></td>
                <td className="num">{fmt(r.total)}</td>
                <td className="num">{fmt(due(r))}</td>
                <td><button type="button" className="ghost small" onClick={() => view(r.id)}>PDF</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="muted">No invoices found.</td></tr>}
            {rows.length > 0 && (
              <tr>
                <td colSpan={5}><b>{rows.length} invoice{rows.length === 1 ? '' : 's'}</b></td>
                <td className="num"><b>{fmt(totalAmount)}</b></td>
                <td className="num"><b>{fmt(totalDue)}</b></td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}