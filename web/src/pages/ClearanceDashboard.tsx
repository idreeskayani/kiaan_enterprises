import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getUser } from '../api';
import { Badge, fmt } from '../components';
import { CLEARANCE_STATUSES, label } from '../constants';

export default function ClearanceDashboard() {
  const nav = useNavigate();
  const canWork = ['ADMIN', 'CLEARING_AGENT'].includes(getUser()?.role ?? '');
  const [stats, setStats] = useState<any>(null);
  const [ongoing, setOngoing] = useState<any[]>([]);
  const [unpaid, setUnpaid] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api('/clearance/stats'),
      api('/clearance?scope=ongoing'),
      api('/clearance?scope=invoiced'),
    ])
      .then(([s, o, i]) => {
        setStats(s);
        setOngoing(o.slice(0, 8));
        setUnpaid(i.filter((j: any) => j.payment !== 'PAID').slice(0, 8));
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
        {canWork && <Link to="/clearance/new"><button type="button">+ New job</button></Link>}
      </div>
      {error && <div className="error">{error}</div>}

      {stats && (
        <>
          <div className="grid" style={{ marginBottom: 14 }}>
            {stat('Ongoing jobs', stats.inProgress, '/clearance/jobs?scope=ongoing')}
            {stat('Ready to invoice', stats.readyToInvoice, '/clearance/jobs?scope=ready')}
            {stat('Released', stats.released, '/clearance/jobs?scope=completed')}
            {stat('All jobs', stats.jobs, '/clearance/jobs?scope=all')}
            {stat('Invoices issued', stats.invoices.issued, '/clearance/invoices')}
            {stat('Paid', stats.invoices.paid, '/clearance/invoices?payment=PAID')}
            {stat('Unpaid', stats.invoices.unpaid, '/clearance/invoices?payment=UNPAID')}
            {stat('Part paid', stats.invoices.partial, '/clearance/invoices?payment=PARTIAL')}
            {stat('Invoiced (PKR)', fmt(stats.amounts.invoiced))}
            {stat('Collected (PKR)', fmt(stats.amounts.collected))}
            {stat('Outstanding (PKR)', fmt(stats.amounts.outstanding))}
          </div>
          <div className="row" style={{ marginBottom: 18, gap: 6 }}>
            {CLEARANCE_STATUSES.map((s) => (
              <button key={s} type="button" className="ghost small" style={{ flex: 'none' }}
                onClick={() => nav(`/clearance/jobs?scope=all&status=${s}`)}>
                {label(s)} · {stats.byStatus[s] ?? 0}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="card">
        <h3>Ongoing jobs</h3>
        <table>
          <thead>
            <tr><th>Job</th><th>Customer</th><th>GD No</th><th>Stage</th><th>Opened</th></tr>
          </thead>
          <tbody>
            {ongoing.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/clearance/jobs/${r.id}`}>{r.jobNo}</Link></td>
                <td>{r.customerName}</td>
                <td>{r.gdNo ?? '-'}</td>
                <td><Badge status={r.status} /></td>
                <td>{new Date(r.createdAt).toLocaleDateString('en-GB')}</td>
              </tr>
            ))}
            {ongoing.length === 0 && <tr><td colSpan={5} className="muted">No ongoing jobs.</td></tr>}
          </tbody>
        </table>
      </div>

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