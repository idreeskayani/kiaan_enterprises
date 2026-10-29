import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getUser, openQuotationPdf } from '../api';
import { Badge, fmt } from '../components';
import { PencilIcon, TrashIcon } from '../Icons';
import { ShareButton } from '../Share';

const QUOTE_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'];

export default function Quotations() {
  const nav = useNavigate();
  const canAct = getUser()?.role === 'OPERATOR';
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  function load() {
    api(`/quotations${status ? `?status=${status}` : ''}`)
      .then(setRows)
      .catch((e) => setError(e.message));
  }

  useEffect(load, [status]);
  // a draft saved while leaving the form may still be on its way
  useEffect(() => {
    const t = setTimeout(load, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
      load();
    }
  }

  async function accept(id: string) {
    setBusy(id);
    setError('');
    try {
      const r = await api(`/quotations/${id}/accept`, { method: 'POST' });
      nav(`/shipments/${r.shipment.id}`); // booked: continue on the shipment
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
      load();
    }
  }

  function remove(q: any) {
    const note = q.shipment ? ` The shipment ${q.shipment.refNo} booked from it will stay.` : '';
    if (!window.confirm(`Delete quotation ${q.quoteNo}?${note}`)) return;
    act(q.id, () => api(`/quotations/${q.id}`, { method: 'DELETE' }));
  }

  function reject(id: string) {
    if (!window.confirm('Mark this quotation as rejected by the client?')) return;
    act(id, () => api(`/quotations/${id}/reject`, { method: 'POST' }));
  }

  // open the tab on click so the browser does not block it
  function view(id: string) {
    const win = window.open('', '_blank');
    openQuotationPdf(id, win).catch((e) => setError(e.message));
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, flex: 3 }}>Quotations</h1>
        <div>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {QUOTE_STATUSES.map((s) => (
              <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </div>
        {canAct && <Link to="/shipments/new"><button>+ New quotation</button></Link>}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Quote</th><th>Customer</th><th>Route</th>
              <th className="num">Total (PKR)</th><th>Valid until</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => {
              const open = q.status === 'DRAFT' || q.status === 'SENT';
              return (
                <tr key={q.id}>
                  <td><Link to={`/quotations/${q.id}`}>{q.quoteNo}</Link></td>
                  <td>{q.customer?.name}</td>
                  <td>{[q.payload?.origin, q.payload?.destination].join(' → ')}</td>
                  <td className="num">{fmt(q.total)}</td>
                  <td>{new Date(q.validUntil).toLocaleDateString()}</td>
                  <td><Badge status={q.status} /></td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <button className="ghost small" onClick={() => view(q.id)}>View</button>
                      {canAct && q.status !== 'REJECTED' && q.status !== 'EXPIRED' && (
                        <ShareButton
                          path={`/quotations/${q.id}/pdf`}
                          invoiceNo={q.quoteNo}
                          company="Kiaan Freight Services"
                          customer={q.customer?.name}
                          total={q.total}
                          label="Send"
                          docLabel="quotation"
                          onShared={() => q.status === 'DRAFT' && api(`/quotations/${q.id}/send`, { method: 'POST' }).then(load)}
                        />
                      )}
                      {canAct && open && (
                        <button className="ghost small" title="Edit quotation" aria-label="Edit quotation"
                          onClick={() => nav(`/quotations/${q.id}/edit`)}><PencilIcon size={14} /></button>
                      )}
                      {canAct && (
                        <button className="small" style={{ background: '#fee2e2', color: '#991b1b' }}
                          title="Delete quotation" aria-label="Delete quotation"
                          disabled={busy === q.id} onClick={() => remove(q)}><TrashIcon size={14} /></button>
                      )}
                      {canAct && open && (
                        <button className="small" disabled={busy === q.id} onClick={() => accept(q.id)}>Accept &amp; book</button>
                      )}
                      {canAct && q.status === 'SENT' && (
                        <button className="ghost small" disabled={busy === q.id} onClick={() => reject(q.id)}>Reject</button>
                      )}
                      {q.shipment && <Link to={`/shipments/${q.shipment.id}`}>{q.shipment.refNo}</Link>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="muted">No quotations found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}