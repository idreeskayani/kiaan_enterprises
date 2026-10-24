import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, openPdf } from '../api';
import { Badge, fmt } from '../components';

export default function Invoices() {
  const [payment, setPayment] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      setRows(await api(`/invoices${payment ? `?payment=${payment}` : ''}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment]);

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

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, flex: 4 }}>Invoices</h1>
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
              return (
                <tr key={r.id}>
                  <td>{r.invoiceNo}</td>
                  <td><Link to={`/shipments/${r.shipmentId}`}>{r.shipment.refNo}</Link></td>
                  <td>{r.shipment.customer.name}</td>
                  <td className="num">{fmt(r.total)}</td>
                  <td><Badge status={paid ? 'PAID' : 'UNPAID'} /></td>
                  <td>{new Date(r.issuedAt).toLocaleDateString()}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="ghost small" onClick={() => act(() => openPdf(r.id))}>PDF</button>
                      <button
                        className="small"
                        onClick={() =>
                          act(() =>
                            api(`/invoices/${r.id}/status`, {
                              method: 'PATCH',
                              body: { status: paid ? 'UNPAID' : 'PAID' },
                            }),
                          )
                        }
                      >
                        {paid ? 'Mark unpaid' : 'Mark paid'}
                      </button>
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
    </>
  );
}