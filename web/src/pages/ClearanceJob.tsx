import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Badge, fmt } from '../components';
import { CLEARANCE_STATUSES, PAYMENT_STATES, label } from '../constants';

const SCOPES: [string, string][] = [
  ['ongoing', 'Ongoing'],
  ['ready', 'Ready to invoice'],
  ['completed', 'Released'],
  ['all', 'All jobs'],
];

export default function ClearanceJobs() {
  const [sp] = useSearchParams();
  const [scope, setScope] = useState(sp.get('scope') ?? 'ongoing');
  const [status, setStatus] = useState(sp.get('status') ?? '');
  const [payment, setPayment] = useState(sp.get('payment') ?? '');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams();
      if (scope !== 'all') qs.set('scope', scope);
      if (status) qs.set('status', status);
      if (payment) qs.set('payment', payment);
      if (q.trim()) qs.set('q', q.trim());
      const s = qs.toString();
      api(`/clearance${s ? `?${s}` : ''}`)
        .then((r) => {
          setRows(r);
          setError('');
        })
        .catch((e) => setError(e.message));
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [scope, status, payment, q]);

  return (
    <>
      <h1>Clearance jobs</h1>
      {error && <div className="error">{error}</div>}

      <div className="row" style={{ marginBottom: 12, gap: 6 }}>
        {SCOPES.map(([k, text]) => (
          <button key={k} type="button" className={scope === k ? '' : 'ghost'} style={{ flex: 'none' }}
            onClick={() => { setScope(k); setStatus(''); setPayment(''); }}>
            {text}
          </button>
        ))}
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <div style={{ flex: 3 }}>
          <input type="search" placeholder="Search job, customer, GD no or invoice" value={q}
            onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any stage</option>
            {CLEARANCE_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </div>
        <div>
          <select value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="">Any payment</option>
            {PAYMENT_STATES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Customer</th>
              <th>Source</th>
              <th>GD No</th>
              <th>Stage</th>
              <th>Invoice</th>
              <th>Payment</th>
              <th className="num">Total (PKR)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/clearance/jobs/${r.id}`}>{r.jobNo}</Link></td>
                <td>{r.customerName}</td>
                <td>{r.sourceInvoice?.invoiceNo ?? 'Direct'}</td>
                <td>{r.gdNo ?? '-'}</td>
                <td><Badge status={r.status} /></td>
                <td>{r.invoiceNo ?? '-'}</td>
                <td>
                  <Badge status={r.payment} />
                  {r.payment === 'PARTIAL' && <span className="due">Due {fmt(r.dueAmount)}</span>}
                </td>
                <td className="num">{fmt(r.total)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="muted">No jobs found.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}