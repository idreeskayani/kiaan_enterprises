import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getUser, openPdf, openPdfPath } from '../api';
import { Badge, fmt } from '../components';
import { ShareButton } from '../Share';
import CostsModal from '../CostsModal';
import { PayFields, PaymentNote, emptyPay, payBody, payError as checkPay, type PayInfo } from '../PaymentForm';

export default function Invoices() {
  const freightStaff = getUser()?.role === 'OPERATOR';
  const [payment, setPayment] = useState('');
  const [customer, setCustomer] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [costsFor, setCostsFor] = useState<any>(null);
  const [error, setError] = useState('');

  // remaining-dues report (shown when the filter is "Remaining dues")
  const [reports, setReports] = useState<any[]>([]);
  const [reportNote, setReportNote] = useState<{ id: string; text: string } | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const lastSent = useRef(0);

  // payment popup
  const [payFor, setPayFor] = useState<any>(null);
  const [due, setDue] = useState('');
  const [payError, setPayError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pay, setPay] = useState<PayInfo>(emptyPay);

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

  // the report is made for one customer: the typed name must match a customer from the list
  const isDues = payment === 'DUES';
  // the report lists whatever the filter shows (All, Draft, Unpaid, Remaining dues, Paid) for the chosen customer
  const scope = payment || 'ALL';
  const scopeQs = `?scope=${scope}`;
  const scopeLabel: Record<string, string> = {
    ALL: 'All invoices', DRAFT: 'Draft', UNPAID: 'Unpaid', DUES: 'Remaining dues', PAID: 'Paid',
  };
  const selected = customers.find(
    (c) => c.name.trim().toLowerCase() === customer.trim().toLowerCase(),
  );
  // the search is a partial match, so with a chosen customer only that customer's invoices are counted
  const shown = selected ? rows.filter((r) => r.customerName === selected.name) : rows;
  const totalRemaining = shown.reduce((a, r) => a + Number(r.remaining ?? 0), 0);
  const totalProfit = shown.reduce((a, r) => a + Number(r.profit ?? 0), 0);
  const canReport = !!selected && shown.length > 0;

  async function loadReports() {
    if (!selected) return;
    try {
      setReports(await api(`/invoices/dues/${selected.id}/reports`));
    } catch {
      setReports([]);
    }
  }
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    api(`/invoices/dues/${selected.id}/reports`)
      .then((r) => alive && setReports(r))
      .catch(() => alive && setReports([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  async function saveReport(status: 'DRAFT' | 'SENT') {
    if (!selected) return;
    setError('');
    setReportBusy(true);
    try {
      const r = await api(`/invoices/dues/${selected.id}/report`, { method: 'POST', body: { status, scope } });
      if (status === 'DRAFT') setReportNote({ id: selected.id, text: `Draft saved as ${r.reportNo}` });
      await loadReports();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReportBusy(false);
    }
  }

  async function viewReport(path: string) {
    setError('');
    const win = window.open('', '_blank');
    try {
      await openPdfPath(path, win);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // sharing keeps a copy of what was sent (once per share, even if several buttons are used)
  function reportShared() {
    if (Date.now() - lastSent.current < 60_000) return;
    lastSent.current = Date.now();
    saveReport('SENT');
  }

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
    setPay(emptyPay);
    setPayError('');
  }

  function closePay() {
    if (saving) return;
    setPayFor(null);
  }

  async function savePayment(body: { status: 'PAID' | 'PARTIAL'; dueAmount?: number }) {
    const err = checkPay(pay);
    if (err) return setPayError(err);
    setSaving(true);
    setPayError('');
    try {
      await api(`/invoices/${payFor.id}/status`, { method: 'PATCH', body: { ...body, ...payBody(pay) } });
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
        {freightStaff && <Link to="/shipments/new?type=invoice"><button>+ New invoice</button></Link>}
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
            <option value="DRAFT">Draft</option>
            <option value="UNPAID">Unpaid</option>
            <option value="DUES">Remaining dues</option>
            <option value="PAID">Paid</option>
          </select>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {isDues && (
        <div className="card" style={{ display: 'flex', gap: 36, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div className="muted">Total remaining dues{selected ? ` · ${selected.name}` : ''}</div>
            <b style={{ fontSize: 24 }}>PKR {fmt(totalRemaining)}</b>
          </div>
          <div>
            <div className="muted">Open invoices</div>
            <b style={{ fontSize: 18 }}>{shown.length}</b>
          </div>
          <div>
            <div className="muted">Profit on these invoices</div>
            <b style={{ fontSize: 18 }} className={totalProfit >= 0 ? 'profit-pos' : 'profit-neg'}>
              {fmt(totalProfit)}
            </b>
          </div>
        </div>
      )}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>MAWB</th>
              <th>HAWB</th>
              <th>Shipment</th>
              <th>Customer</th>
              <th className="num">Total</th>
              <th className="num">Profit</th>
              {isDues && <th className="num">Remaining</th>}
              <th>Payment</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const paid = r.status === 'PAID';
              const dueNow = Number(r.dueAmount ?? 0);
              const draft = r.status === 'DRAFT';
              const partial = !paid && dueNow > 0;
              return (
                <tr key={r.id}>
                  <td>{r.invoiceNo}</td>
                  <td>{r.mawb || <span className="muted">—</span>}</td>
                  <td>{r.hawb || <span className="muted">—</span>}</td>
                  <td>{r.shipment ? <Link to={`/shipments/${r.shipmentId}`}>{r.shipment.refNo}</Link> : ''}</td>
                  <td>{r.customerName}</td>
                  <td className="num">{fmt(r.total)}</td>
                  <td className="num" style={{ cursor: 'pointer' }} title="Costs & profit" onClick={() => setCostsFor(r)}>
                    {Number(r.costTotal) > 0 ? (
                      <>
                        <b className={Number(r.profit) >= 0 ? 'profit-pos' : 'profit-neg'}>{fmt(r.profit)}</b>
                        <span className="muted" style={{ display: 'block', fontSize: 12 }}>Cost {fmt(r.costTotal)}</span>
                      </>
                    ) : (
                      <span className="muted">Add costs</span>
                    )}
                  </td>
                  {isDues && <td className="num"><b>{fmt(r.remaining)}</b></td>}
                  <td>
                    <Badge status={paid ? 'PAID' : draft ? 'DRAFT' : partial ? 'PARTIAL' : 'UNPAID'} />
                    {partial && <span className="due">Remaining dues: PKR {fmt(dueNow)}</span>}
                    <PaymentNote p={r.lastPayment} />
                  </td>
                  <td>{new Date(r.issuedAt).toLocaleDateString()}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="ghost small" onClick={() => act(() => openPdf(r.id))}>PDF</button>
                      {freightStaff && !r.shipmentId && !paid && (
                        <Link to={`/invoices/${r.id}/edit`}><button className="ghost small">Edit</button></Link>
                      )}
                      <button className="ghost small" onClick={() => setCostsFor(r)}>Costs</button>
                      <ShareButton path={`/invoices/${r.id}/pdf`} invoiceNo={r.invoiceNo}
                        company="Kiaan Freight Services" customer={r.customerName} total={r.total}
                        onShared={() => draft && api(`/invoices/${r.id}/issue`, { method: 'POST' }).then(load)} />
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
            {shown.length === 0 && (
              <tr><td colSpan={isDues ? 11 : 10} className="muted">No invoices found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="ghost" disabled={!canReport || reportBusy} onClick={() => saveReport('DRAFT')}>
            Save draft
          </button>
          <button
            className="ghost"
            disabled={!canReport}
            onClick={() => selected && viewReport(`/invoices/dues/${selected.id}/pdf${scopeQs}`)}
          >
            View report
          </button>
          {canReport && selected ? (
            <ShareButton
              path={`/invoices/dues/${selected.id}/pdf${scopeQs}`}
              invoiceNo={`SOA-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`}
              company="Kiaan Freight Services"
              customer={selected.name}
              total={totalRemaining}
              label="Share report"
              className=""
              docLabel="statement"
              onShared={reportShared}
            />
          ) : (
            <button disabled>Share report</button>
          )}
        </div>
        {!selected && (
          <p className="muted" style={{ margin: '10px 0 0' }}>
            Choose the customer from the search list to make a report of their invoices.
          </p>
        )}
        {selected && shown.length === 0 && (
          <p className="muted" style={{ margin: '10px 0 0' }}>
            {scope === 'DUES' ? 'This customer has no remaining dues.' : 'No invoices to report for this filter.'}
          </p>
        )}
        {reportNote && reportNote.id === selected?.id && (
          <p className="muted" style={{ margin: '10px 0 0' }}>{reportNote.text}</p>
        )}

        {selected && reports.some((x) => x.customerId === selected.id) && (
          <table style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>Saved reports</th>
                <th>Type</th>
                <th>Status</th>
                <th>Date</th>
                <th className="num">Remaining (PKR)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reports.filter((x) => x.customerId === selected?.id).map((rep) => (
                <tr key={rep.id}>
                  <td>{rep.reportNo}</td>
                  <td>{scopeLabel[rep.scope] ?? 'Remaining dues'}</td>
                  <td>{rep.status === 'SENT' ? 'Sent' : 'Draft'}</td>
                  <td>{new Date(rep.createdAt).toLocaleDateString()}</td>
                  <td className="num">{fmt(rep.totalDue)}</td>
                  <td>
                    <button className="ghost small" onClick={() => viewReport(`/invoices/dues-reports/${rep.id}/pdf`)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {costsFor && (
        <CostsModal invoice={costsFor} onClose={() => setCostsFor(null)} onChanged={load} />
      )}

      {payFor && (
        <div className="modal-backdrop" onClick={closePay}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Payment for {payFor.invoiceNo}</h3>
            <p className="muted" style={{ margin: '0 0 14px' }}>
              {payFor.customerName} · Total PKR {fmt(payFor.total)}
            </p>
            <span className="paydir credit">Credit · money received from customer</span>
            {payError && <div className="error">{payError}</div>}

            <PayFields value={pay} onChange={setPay} disabled={saving} />

            <div style={{ height: 14 }} />
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