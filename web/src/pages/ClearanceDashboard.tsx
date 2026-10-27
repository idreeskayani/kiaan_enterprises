import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getUser } from '../api';
import { Badge, fmt } from '../components';

export default function ClearanceDashboard() {
  const nav = useNavigate();
  const canWork = getUser()?.role === 'CLEARING_AGENT';
  const [stats, setStats] = useState<any>(null);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [unpaid, setUnpaid] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api('/clearance/stats'),
      api('/clearance'),
      api('/clearance?scope=invoiced'),
    ])
      .then(([s, all, inv]) => {
        setStats(s);
        // invoices that were started but not generated yet
        setDrafts(all.filter((j: any) => !j.invoiceNo && j.status !== 'CANCELLED').slice(0, 10));
        setUnpaid(inv.filter((j: any) => j.payment !== 'PAID').slice(0, 8));
      })
      .catch((e) => setError(e.message));
  }, []);

  const stat = (text: string, value: string | number, to?: string) => (
    <div className="stat" style={to ? { cursor: 'pointer' } : undefined} onClick={to ? () => nav(to) : undefined}>
      <span className="muted">{text}</span>
      <b>{value}</b>
    </div>
  );

  return (
    <>
      <div className="row" style={{ alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, flex: 5 }}>Clearance dashboard</h1>
        {canWork && <Link to="/clearance/new"><button type="button">+ New invoice</button></Link>}
      </div>
      {error && <div className="error">{error}</div>}

      {stats && (
        <div className="grid" style={{ marginBottom: 14 }}>
          {stat('Invoices issued', stats.invoices.issued, '/clearance/invoices')}
          {stat('Paid', stats.invoices.paid, '/clearance/invoices?payment=PAID')}
          {stat('Unpaid', stats.invoices.unpaid, '/clearance/invoices?payment=UNPAID')}
          {stat('Remaining dues', stats.invoices.partial, '/clearance/invoices?payment=PARTIAL')}
          {stat('Invoiced (PKR)', fmt(stats.amounts.invoiced))}
          {stat('Collected (PKR)', fmt(stats.amounts.collected))}
          {stat('Outstanding (PKR)', fmt(stats.amounts.outstanding))}
        </div>
      )}

      {/* <div className="card">
        <h3>Not generated yet</h3>
        <table>
          <thead>
            <tr><th>Customer</th><th>Ref</th><th>Created</th></tr>
          </thead>
          <tbody>
            {drafts.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/clearance/jobs/${r.id}`}>{r.customerName}</Link></td>
                <td>{r.jobNo}</td>
                <td>{new Date(r.createdAt).toLocaleDateString('en-GB')}</td>
              </tr>
            ))}
            {drafts.length === 0 && <tr><td colSpan={3} className="muted">Nothing pending.</td></tr>}
          </tbody>
        </table>
      </div> */}

      <div className="card">
        <h3>Invoices waiting for payment</h3>
        <table>
          <thead>
            <tr><th>Invoice</th><th>Customer</th><th>Payment</th><th className="num">Total (PKR)</th><th className="num">Due (PKR)</th></tr>
          </thead>
          <tbody>
            {unpaid.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/clearance/jobs/${r.id}`}>{r.invoiceNo}</Link></td>
                <td>{r.customerName}</td>
                <td><Badge status={r.payment} /></td>
                <td className="num">{fmt(r.total)}</td>
                <td className="num">{fmt(r.payment === 'PARTIAL' ? r.dueAmount : r.total)}</td>
              </tr>
            ))}
            {unpaid.length === 0 && <tr><td colSpan={5} className="muted">Nothing outstanding.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}