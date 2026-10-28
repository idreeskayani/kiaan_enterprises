import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, getUser, openClearancePdf } from '../api';
import { Badge, fmt } from '../components';
import { TrashIcon } from '../Icons';
import { ShareButton } from '../Share';

export default function ClearanceInvoices() {
  const [sp] = useSearchParams();
  const [payment, setPayment] = useState(sp.get('payment') ?? '');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const role = getUser()?.role;
  const canWork = role === 'CLEARING_AGENT';
  const canPay = canWork || role === 'ACCOUNTANT';

  // payment popup
  const [payFor, setPayFor] = useState<any>(null);
  const [dueIn, setDueIn] = useState('');
  const [payError, setPayError] = useState('');
  const [saving, setSaving] = useState(false);

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
  }, [payment, q, tick]);

  // close the popup with Escape
  useEffect(() => {
    if (!payFor) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closePay();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payFor, saving]);

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

  async function removeInvoice(r: any) {
    if (!window.confirm(`Delete invoice ${r.invoiceNo}? The job stays and you can generate the invoice again.`)) return;
    try {
      await api(`/clearance/${r.id}/invoice`, { method: 'DELETE' });
      setTick((t) => t + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function markUnpaid(r: any) {
    try {
      await api(`/clearance/${r.id}/payment`, { method: 'PATCH', body: { status: 'UNPAID' } });
      setTick((t) => t + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function openPay(r: any) {
    setPayFor(r);
    setDueIn('');
    setPayError('');
  }

  function closePay() {
    if (saving) return;
    setPayFor(null);
  }

  async function savePayment(body: { status: 'PAID' | 'PARTIAL'; dueAmount?: number }) {
    setSaving(true);
    setPayError('');
    try {
      await api(`/clearance/${payFor.id}/payment`, { method: 'PATCH', body });
      setPayFor(null);
      setTick((t) => t + 1);
    } catch (e) {
      setPayError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function saveDue() {
    const amount = Number(dueIn);
    const total = Number(payFor.total);
    if (!(amount > 0)) return setPayError('Enter the remaining dues amount');
    if (amount >= total) {
      return setPayError(`Remaining dues must be less than the invoice total (${fmt(total)})`);
    }
    savePayment({ status: 'PARTIAL', dueAmount: Math.round(amount * 100) / 100 });
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
            <option value="">All invoices</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIAL">Remaining dues</option>
            <option value="PAID">Paid</option>
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
            {rows.map((r) => {
              const paid = r.payment === 'PAID';
              const partial = r.payment === 'PARTIAL';
              return (
                <tr key={r.id}>
                  <td><Link to={`/clearance/jobs/${r.id}`}>{r.invoiceNo}</Link></td>
                  <td>{r.invoicedAt ? new Date(r.invoicedAt).toLocaleDateString('en-GB') : '-'}</td>
                  <td>{r.customerName}</td>
                  <td>{r.jobNo}</td>
                  <td>
                    <Badge status={r.payment} />
                    {partial && <span className="due">Remaining dues: PKR {fmt(r.dueAmount)}</span>}
                  </td>
                  <td className="num">{fmt(r.total)}</td>
                  <td className="num">{fmt(due(r))}</td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <button type="button" className="ghost small" onClick={() => view(r.id)}>View</button>
                      <ShareButton path={`/clearance/${r.id}/pdf`} invoiceNo={r.invoiceNo}
                        company="TNI Enterprises" customer={r.customerName} total={r.total} />
                      {canPay && (paid ? (
                        <button type="button" className="small" onClick={() => markUnpaid(r)}>Mark unpaid</button>
                      ) : (
                        <button type="button" className="small" onClick={() => openPay(r)}>
                          {partial ? 'Update payment' : 'Mark paid'}
                        </button>
                      ))}
                      {canWork && (
                        <button type="button" className="small"
                          style={{ background: '#fee2e2', color: '#991b1b' }}
                          title="Delete invoice" aria-label="Delete invoice"
                          onClick={() => removeInvoice(r)}><TrashIcon size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
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

      {payFor && (
        <div className="modal-backdrop" onClick={closePay}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Payment for {payFor.invoiceNo}</h3>
            <p className="muted" style={{ margin: '0 0 14px' }}>
              {payFor.customerName} · Total PKR {fmt(payFor.total)}
            </p>
            {payError && <div className="error">{payError}</div>}

            <button style={{ width: '100%' }} disabled={saving} onClick={() => savePayment({ status: 'PAID' })}>
              Fully paid
            </button>

            <div className="or">— or, if not fully paid —</div>

            <label>Remaining dues (PKR)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount still to be paid"
              value={dueIn}
              onChange={(e) => setDueIn(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveDue()}
              autoFocus
            />
            <div className="actions">
              <button className="ghost" disabled={saving} onClick={closePay}>Cancel</button>
              <button disabled={saving || !dueIn} onClick={saveDue}>Save remaining dues</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}