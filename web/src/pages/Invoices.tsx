import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, openPdf } from '../api';
import { Badge, fmt } from '../components';
import { ShareButton } from '../Share';

export default function Invoices() {
  const [payment, setPayment] = useState('');
  const [customer, setCustomer] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');

  // payment popup
  const [payFor, setPayFor] = useState<any>(null);
  const [due, setDue] = useState('');
  const [payError, setPayError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const qs = new URLSearchParams();
      if (payment) qs.set('payment', payment);
      if (customer.trim()) qs.set('customer', customer.trim());
      const q = qs.toString();
      setRows(await api(`/invoices${q ? `?${q}` : ''}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // reload when a filter changes (customer search is debounced while typing)
  useEffect(() => {
    const t = setTimeout(load, customer ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment, customer]);

  // customer names for the search suggestions
  useEffect(() => {
    api('/customers').then(setCustomers).catch(() => setCustomers([]));
  }, []);

  // close the popup with Escape
  useEffect(() => {
    if (!payFor) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closePay();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payFor]);

  async function act(fn: () => Promise<unknown>) {
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function remove(r: any) {
    if (!window.confirm(`Delete invoice ${r.invoiceNo}? This cannot be undone.`)) return;
    act(() => api(`/invoices/${r.id}`, { method: 'DELETE' }));
  }

  function openPay(r: any) {
    setPayFor(r);
    setDue('');
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
      await api(`/invoices/${payFor.id}/status`, { method: 'PATCH', body });
      setPayFor(null);
      await load();
    } catch (e) {
      setPayError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function saveDue() {
    const amount = Number(due);
    const total = Number(payFor.total);
    if (!(amount > 0)) return setPayError('Enter the remaining dues amount');
    if (amount >= total) {
      return setPayError(`Remaining dues must be less than the invoice total (${fmt(total)})`);
    }
    savePayment({ status: 'PARTIAL', dueAmount: Math.round(amount * 100) / 100 });
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, flex: 3 }}>Invoices</h1>
        <div style={{ flex: 2 }}>
          <input
            type="search"
            list="invoice-customers"
            placeholder="Search by customer name"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          />
          <datalist id="invoice-customers">
            {customers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </div>
        <div>
          <select value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="">All invoices</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PAID">Paid</option>
          </select>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Shipment</th>
              <th>Customer</th>
              <th className="num">Total</th>
              <th>Payment</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const paid = r.status === 'PAID';
              const dueNow = Number(r.dueAmount ?? 0);
              const partial = !paid && dueNow > 0;
              return (
                <tr key={r.id}>
                  <td>{r.invoiceNo}</td>
                  <td><Link to={`/shipments/${r.shipmentId}`}>{r.shipment.refNo}</Link></td>
                  <td>{r.shipment.customer.name}</td>
                  <td className="num">{fmt(r.total)}</td>
                  <td>
                    <Badge status={paid ? 'PAID' : partial ? 'PARTIAL' : 'UNPAID'} />
                    {partial && <span className="due">Remaining dues: PKR {fmt(dueNow)}</span>}
                  </td>
                  <td>{new Date(r.issuedAt).toLocaleDateString()}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="ghost small" onClick={() => act(() => openPdf(r.id))}>PDF</button>
                      <ShareButton path={`/invoices/${r.id}/pdf`} invoiceNo={r.invoiceNo}
                        company="Kiaan Freight Services" customer={r.shipment.customer.name} total={r.total} />
                      {paid ? (
                        <button
                          className="small"
                          onClick={() =>
                            act(() =>
                              api(`/invoices/${r.id}/status`, {
                                method: 'PATCH',
                                body: { status: 'UNPAID' },
                              }),
                            )
                          }
                        >
                          Mark unpaid
                        </button>
                      ) : (
                        <button className="small" onClick={() => openPay(r)}>
                          {partial ? 'Update payment' : 'Mark paid'}
                        </button>
                      )}
                      <button
                        className="small"
                        style={{ background: '#fee2e2', color: '#991b1b' }}
                        title="Delete invoice"
                        aria-label="Delete invoice"
                        onClick={() => remove(r)}
                      >
                        <svg
                          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4h6v2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="muted">No invoices found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {payFor && (
        <div className="modal-backdrop" onClick={closePay}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Payment for {payFor.invoiceNo}</h3>
            <p className="muted" style={{ margin: '0 0 14px' }}>
              {payFor.shipment.customer.name} · Total PKR {fmt(payFor.total)}
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
              value={due}
              onChange={(e) => setDue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveDue()}
              autoFocus
            />
            <div className="actions">
              <button className="ghost" disabled={saving} onClick={closePay}>Cancel</button>
              <button disabled={saving || !due} onClick={saveDue}>Save remaining dues</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
