import { useEffect, useMemo, useState } from 'react';
import { api, openPdfPath } from '../api';
import { Badge, fmt } from '../components';
import { DateRange, useDateRange } from '../DateRange';
import { ShareButton } from '../Share';
import { PayFields, PaymentNote, emptyPay, payBody, payError as checkPay, type PayInfo } from '../PaymentForm';

// Every debit (cost) of every invoice in one list: filter by company and payment status.
export default function Debits() {
  const [vendor, setVendor] = useState('');
  const [payment, setPayment] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [vendors, setVendors] = useState<string[]>([]);
  const [error, setError] = useState('');
  const range = useDateRange();

  // payment popup
  const [payFor, setPayFor] = useState<any>(null);
  const [due, setDue] = useState('');
  const [payError, setPayError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pay, setPay] = useState<PayInfo>(emptyPay);

  async function load() {
    try {
      const qs = new URLSearchParams();
      if (vendor.trim()) qs.set('vendor', vendor.trim());
      if (payment) qs.set('payment', payment);
      if (range.from) qs.set('from', range.from);
      if (range.to) qs.set('to', range.to);
      if (range.bad) return;
      const q = qs.toString();
      setRows(await api(`/invoices/costs${q ? `?${q}` : ''}`));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // reload when a filter changes (company search is debounced while typing)
  useEffect(() => {
    const t = setTimeout(load, vendor ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendor, payment, range.from, range.to]);

  // company names for the search suggestions (from all debits, not only the filtered ones)
  useEffect(() => {
    api('/invoices/costs')
      .then((all: any[]) =>
        setVendors([...new Set(all.map((c) => c.vendor).filter(Boolean))].sort() as string[]),
      )
      .catch(() => setVendors([]));
  }, []);

  // close the popup with Escape
  useEffect(() => {
    if (!payFor) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closePay();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payFor, saving]);

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

  async function savePayment(
    target: any,
    body: { status: 'PAID' | 'UNPAID' | 'PARTIAL'; dueAmount?: number },
  ) {
    // PAID / PARTIAL need the payment method; "Mark unpaid" does not
    if (body.status !== 'UNPAID') {
      const err = checkPay(pay);
      if (err) return setPayError(err);
    }
    setSaving(true);
    setPayError('');
    try {
      await api(`/invoices/costs/${target.id}/payment`, {
        method: 'PATCH',
        body: body.status === 'UNPAID' ? body : { ...body, ...payBody(pay) },
      });
      setPayFor(null);
      await load();
    } catch (e) {
      const msg = (e as Error).message;
      if (payFor) setPayError(msg);
      else setError(msg);
    } finally {
      setSaving(false);
    }
  }

  function saveDue() {
    const amount = Number(due);
    const total = Number(payFor.amount);
    if (!(amount > 0)) return setPayError('Enter the remaining dues amount');
    if (amount >= total) {
      return setPayError(`Remaining dues must be less than the cost amount (${fmt(total)})`);
    }
    savePayment(payFor, { status: 'PARTIAL', dueAmount: Math.round(amount * 100) / 100 });
  }

  // what we still owe on a row
  const owed = (r: any) =>
    r.payment === 'PAID' ? 0 : r.payment === 'PARTIAL' ? Number(r.dueAmount) : Number(r.amount);
  const totals = useMemo(
    () => ({
      amount: rows.reduce((s, r) => s + Number(r.amount), 0),
      owed: rows.reduce((s, r) => s + owed(r), 0),
    }),
    [rows],
  );

  // vendor ledger: the same filters as the list (company, status, dates); no company typed = all vendors
  const reportPath = `/invoices/costs/report?${new URLSearchParams({
    ...(vendor.trim() && { vendor: vendor.trim() }),
    ...(payment && { payment }),
    ...(range.from && { from: range.from }),
    ...(range.to && { to: range.to }),
  }).toString()}`;
  const canReport = rows.length > 0 && !range.bad;
  const reportWho = vendor.trim() || 'All vendors';

  async function viewReport() {
    setError('');
    const win = window.open('', '_blank'); // opened on click so the browser does not block it
    try {
      await openPdfPath(reportPath, win);
    } catch (e) {
      win?.close();
      setError((e as Error).message);
    }
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, flex: 3 }}>Debits</h1>
        <div style={{ flex: 2 }}>
          <input
            type="search"
            list="debit-vendors"
            placeholder="Search by company (paid to)"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />
          <datalist id="debit-vendors">
            {vendors.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </div>
        <div>
          <select value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="">All debits</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIAL">Partial</option>
            <option value="PAID">Paid</option>
          </select>
        </div>
      </div>
      <DateRange from={range.from} to={range.to} setFrom={range.setFrom} setTo={range.setTo} bad={range.bad} />
      {error && <div className="error">{error}</div>}

      <div className="grid" style={{ marginBottom: 14 }}>
        <div className="stat">
          <span className="muted">Total debit{vendor.trim() || payment || range.active ? ' (filtered)' : ''}</span>
          <b>{fmt(totals.amount)}</b>
        </div>
        <div className="stat">
          <span className="muted">Still to pay{vendor.trim() || payment || range.active ? ' (filtered)' : ''}</span>
          <b className={totals.owed > 0 ? 'profit-neg' : 'profit-pos'}>{fmt(totals.owed)}</b>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="ghost" disabled={!canReport} onClick={viewReport}>
            View report
          </button>
          {canReport ? (
            <ShareButton
              path={reportPath}
              invoiceNo={`VL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`}
              company="Kiaan Freight Services"
              customer={reportWho}
              total={totals.owed}
              label="Share report"
              className=""
              docLabel="vendor ledger"
            />
          ) : (
            <button disabled>Share report</button>
          )}
          <span className="muted">
            Vendor ledger for {reportWho}
            {range.active ? ` · ${range.from || '…'} to ${range.to || '…'}` : ''}
            {payment ? ` · ${payment.toLowerCase()} only` : ''}
          </span>
        </div>
        {!vendor.trim() && (
          <p className="muted" style={{ margin: '10px 0 0' }}>
            Leave the company box empty for a report of all vendors, or pick one company for its own ledger.
          </p>
        )}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Paid to</th>
              <th>Cost for</th>
              <th>Invoice</th>
              <th>Customer</th>
              <th className="num">Amount (PKR)</th>
              <th>Payment</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const paid = r.payment === 'PAID';
              const partial = r.payment === 'PARTIAL';
              return (
                <tr key={r.id}>
                  <td>{new Date(r.incurredAt).toLocaleDateString('en-GB')}</td>
                  <td>{r.vendor ?? <span className="muted">—</span>}</td>
                  <td>
                    {r.label}
                    {r.note && <span className="due" style={{ color: '#6b7686', fontWeight: 400 }}>{r.note}</span>}
                  </td>
                  <td>{r.invoiceNo}</td>
                  <td>{r.customerName}</td>
                  <td className="num">
                    {fmt(r.amount)}
                    {r.currency && (
                      <span className="due" style={{ color: '#6b7686', fontWeight: 400 }}>
                        {r.currency} {fmt(r.foreignAmount)} @ {Number(r.exRate)}
                      </span>
                    )}
                  </td>
                  <td>
                    <Badge status={r.payment} />
                    {partial && <span className="due">Remaining dues: PKR {fmt(r.dueAmount)}</span>}
                    <PaymentNote p={r.lastPayment} />
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      {paid ? (
                        <button
                          className="small"
                          disabled={saving}
                          onClick={() => savePayment(r, { status: 'UNPAID' })}
                        >
                          Mark unpaid
                        </button>
                      ) : (
                        <button className="small" onClick={() => openPay(r)}>
                          {partial ? 'Update payment' : 'Mark paid'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="muted">{range.active ? 'No debits in the selected dates.' : 'No debits found.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {payFor && (
        <div className="modal-backdrop" onClick={closePay}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Payment to {payFor.vendor || 'vendor'}</h3>
            <p className="muted" style={{ margin: '0 0 14px' }}>
              {payFor.label} · {payFor.invoiceNo} · Amount PKR {fmt(payFor.amount)}
            </p>
            <span className="paydir debit">Debit · money paid to vendor</span>
            {payError && <div className="error">{payError}</div>}

            <PayFields value={pay} onChange={setPay} disabled={saving} />

            <div style={{ height: 14 }} />
            <button
              style={{ width: '100%' }}
              disabled={saving}
              onClick={() => savePayment(payFor, { status: 'PAID' })}
            >
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
