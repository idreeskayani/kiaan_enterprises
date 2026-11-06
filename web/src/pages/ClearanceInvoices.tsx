import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, getUser, openClearancePdf, openPdfPath } from '../api';
import { Badge, fmt } from '../components';
import { TrashIcon } from '../Icons';
import { ShareButton } from '../Share';
import { PayFields, PaymentNote, emptyPay, payBody, payError as checkPay, type PayInfo } from '../PaymentForm';

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
  const [pay, setPay] = useState<PayInfo>(emptyPay);

  // customer statements (reports) - same as the freight invoices page
  const [customers, setCustomers] = useState<string[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [reportNote, setReportNote] = useState<{ customer: string; text: string } | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const lastSent = useRef(0);
  const sentDrafts = useRef(new Set<string>());

  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ scope: 'invoiced' });
      if (payment) qs.set('payment', payment);
      if (q.trim()) qs.set('q', q.trim());
      api(`/clearance?${qs.toString()}`)
        .then((r) => {
          setRows(r.filter((x: any) => x.payment));
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
      await api(`/clearance/${payFor.id}/payment`, { method: 'PATCH', body: { ...body, ...payBody(pay) } });
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

  // ---- customer statements. The report lists whatever the filter shows, for the customer typed in the search box.
  const norm = (v: string) => v.trim().toLowerCase();
  const selected = customers.find((c) => norm(c) === norm(q));
  // the search is a partial match, so with a chosen customer only that customer's invoices are counted
  const shown = selected ? rows.filter((r) => norm(r.customerName) === norm(selected)) : rows;
  const scope = payment || 'ALL';
  const scopeLabel: Record<string, string> = {
    ALL: 'All invoices', DRAFT: 'Draft', UNPAID: 'Unpaid', PARTIAL: 'Remaining dues', PAID: 'Paid',
  };
  const canReport = !!selected && shown.length > 0;
  const liveQs = selected ? `customer=${encodeURIComponent(selected)}&scope=${scope}` : '';

  useEffect(() => {
    api('/clearance/customers').then(setCustomers).catch(() => setCustomers([]));
  }, [tick]);

  async function loadReports() {
    if (!selected) return;
    try {
      setReports(await api(`/clearance/reports/drafts?customer=${encodeURIComponent(selected)}`));
    } catch {
      setReports([]);
    }
  }
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    api(`/clearance/reports/drafts?customer=${encodeURIComponent(selected)}`)
      .then((r) => alive && setReports(r))
      .catch(() => alive && setReports([]));
    return () => {
      alive = false;
    };
  }, [selected]);

  async function saveReport(status: 'DRAFT' | 'SENT') {
    if (!selected) return;
    setError('');
    setReportBusy(true);
    try {
      const r = await api(`/clearance/reports`, { method: 'POST', body: { customer: selected, status, scope } });
      if (status === 'DRAFT') setReportNote({ customer: selected, text: `Draft saved as ${r.reportNo}` });
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

  // a saved draft was shared: mark it sent (once); the list refreshes when the share popup closes
  function draftShared(id: string) {
    if (sentDrafts.current.has(id)) return;
    sentDrafts.current.add(id);
    api(`/clearance/reports/${id}/sent`, { method: 'PATCH' }).catch((e) => setError((e as Error).message));
  }

  function removeDraft(rep: { id: string; reportNo: string }) {
    if (!window.confirm(`Delete draft ${rep.reportNo}? This cannot be undone.`)) return;
    setError('');
    api(`/clearance/reports/${rep.id}`, { method: 'DELETE' })
      .then(loadReports)
      .catch((e) => setError((e as Error).message));
  }

  const due = (r: any) =>
    r.payment === 'PAID' ? 0 : r.payment === 'PARTIAL' ? Number(r.dueAmount) : Number(r.total);
  const totalAmount = shown.reduce((s, r) => s + Number(r.total), 0);
  const totalDue = shown.reduce((s, r) => s + due(r), 0);

  return (
    <>
      <h1>Clearance invoices</h1>
      {error && <div className="error">{error}</div>}

      <div className="row" style={{ marginBottom: 14 }}>
        <div style={{ flex: 3 }}>
          <input type="search" list="clearance-customers" placeholder="Search invoice, job, customer or GD no" value={q}
            onChange={(e) => setQ(e.target.value)} />
          <datalist id="clearance-customers">
            {customers.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <select value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="">All invoices</option>
            <option value="DRAFT">Draft</option>
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
            {shown.map((r) => {
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
                    <PaymentNote p={r.lastPayment} imagePath="/clearance/payments" />
                  </td>
                  <td className="num">{fmt(r.total)}</td>
                  <td className="num">{fmt(due(r))}</td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <button type="button" className="ghost small" onClick={() => view(r.id)}>View</button>
                      <ShareButton path={`/clearance/${r.id}/pdf`} invoiceNo={r.invoiceNo}
                        company="TNI Enterprises" customer={r.customerName} total={r.total}
                        onShared={() => r.payment === 'DRAFT' && api(`/clearance/${r.id}/issue`, { method: 'POST' }).then(() => setTick((t) => t + 1))} />
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
            {shown.length === 0 && <tr><td colSpan={8} className="muted">No invoices found.</td></tr>}
            {shown.length > 0 && (
              <tr>
                <td colSpan={5}><b>{shown.length} invoice{shown.length === 1 ? '' : 's'}</b></td>
                <td className="num"><b>{fmt(totalAmount)}</b></td>
                <td className="num"><b>{fmt(totalDue)}</b></td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="ghost" disabled={!canReport || reportBusy} onClick={() => saveReport('DRAFT')}>
            Save draft
          </button>
          <button className="ghost" disabled={!canReport} onClick={() => viewReport(`/clearance/reports/live?${liveQs}`)}>
            View report
          </button>
          {canReport && selected ? (
            <ShareButton
              path={`/clearance/reports/live?${liveQs}`}
              invoiceNo={`SOA-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`}
              company="TNI Enterprises"
              customer={selected}
              total={totalDue}
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
          <p className="muted" style={{ margin: '10px 0 0' }}>No invoices to report for this filter.</p>
        )}
        {reportNote && reportNote.customer === selected && (
          <p className="muted" style={{ margin: '10px 0 0' }}>{reportNote.text}</p>
        )}

        {selected && reports.length > 0 && (
          <table style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>Saved drafts</th>
                <th>Type</th>
                <th>Date</th>
                <th className="num">Remaining (PKR)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((rep) => (
                <tr key={rep.id}>
                  <td>{rep.reportNo}</td>
                  <td>{scopeLabel[rep.scope] ?? 'All invoices'}</td>
                  <td>{new Date(rep.createdAt).toLocaleDateString()}</td>
                  <td className="num">{fmt(rep.totalDue)}</td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <button className="ghost small" onClick={() => viewReport(`/clearance/reports/${rep.id}/pdf`)}>
                        View
                      </button>
                      {/* marked sent as soon as it is shared; leaves the list when the share popup closes */}
                      <ShareButton
                        path={`/clearance/reports/${rep.id}/pdf`}
                        invoiceNo={rep.reportNo}
                        company="TNI Enterprises"
                        customer={selected}
                        total={rep.totalDue}
                        label="Share"
                        docLabel="statement"
                        onShared={() => draftShared(rep.id)}
                        onClose={loadReports}
                      />
                      <button
                        className="small"
                        style={{ background: '#fee2e2', color: '#991b1b' }}
                        title="Delete draft"
                        aria-label="Delete draft"
                        onClick={() => removeDraft(rep)}
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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