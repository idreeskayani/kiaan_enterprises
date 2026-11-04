import { useEffect, useState } from 'react';
import { api } from './api';
import { fmt } from './components';

const SUGGESTIONS = [
  'Airline / shipping line freight',
  'Customs duty & taxes',
  'Terminal / port charges',
  'Handling & labour',
  'Transport / delivery',
  'Documentation',
  'Agent commission',
  'Other',
];
const CURRENCIES = ['PKR', 'USD', 'GBP', 'EUR', 'AED', 'SAR', 'CNY'];

// Costs (debit) of one invoice and the profit that is left.
export default function CostsModal({
  invoice,
  onClose,
  onChanged,
}: {
  invoice: any;
  onClose: () => void;
  onChanged: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState<any>(null);
  const [fx, setFx] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [label, setLabel] = useState('');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('PKR');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');

  useEffect(() => {
    api(`/invoices/${invoice.id}/costs`).then(setData).catch((e) => setError(e.message));
    api('/exchange-rates')
      .then((r) => setFx(Object.fromEntries(r.map((x: any) => [x.currency, Number(x.rate)]))))
      .catch(() => setFx({}));
  }, [invoice.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function pickCurrency(c: string) {
    setCurrency(c);
    setRate(c !== 'PKR' && fx[c] ? String(fx[c]) : '');
  }

  const foreign = currency !== 'PKR';
  const pkrPreview = foreign && Number(amount) > 0 && Number(rate) > 0 ? Number(amount) * Number(rate) : null;

  async function add() {
    setError('');
    if (!label.trim()) return setError('Enter what the cost was for');
    const amt = Number(amount);
    if (!(amt > 0)) return setError('Enter the amount');
    if (foreign && !(Number(rate) > 0)) return setError(`Enter the exchange rate (PKR per 1 ${currency})`);
    setBusy(true);
    try {
      const d = await api(`/invoices/${invoice.id}/costs`, {
        method: 'POST',
        body: {
          label: label.trim(),
          vendor: vendor.trim() || undefined,
          amount: Math.round(amt * 100) / 100,
          currency: foreign ? currency : undefined,
          exRate: foreign ? Math.round(Number(rate) * 10000) / 10000 : undefined,
          note: note.trim() || undefined,
          incurredAt: date || undefined,
        },
      });
      setData(d);
      setLabel('');
      setVendor('');
      setAmount('');
      setNote('');
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: any) {
    if (!window.confirm(`Delete the cost "${c.label}"?`)) return;
    setError('');
    try {
      setData(await api(`/invoices/${invoice.id}/costs/${c.id}`, { method: 'DELETE' }));
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const profit = data?.profit ?? 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 760, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3>Costs &amp; profit · {invoice.invoiceNo}</h3>
        <p className="muted" style={{ margin: '0 0 14px' }}>{invoice.customerName}</p>
        {error && <div className="error">{error}</div>}

        <div className="cost-sum">
          <div><span className="muted">Invoice total</span><b>{fmt(data?.revenue ?? invoice.total)}</b></div>
          <div><span className="muted">Costs (debit)</span><b>{fmt(data?.costTotal ?? 0)}</b></div>
          <div className={profit >= 0 ? 'profit-pos' : 'profit-neg'}>
            <span className="muted">{profit >= 0 ? 'Profit' : 'Loss'}</span>
            <b>{fmt(profit)}</b>
            <small>{data && data.revenue > 0 ? `${data.margin}% margin` : ''}</small>
          </div>
        </div>

        <table style={{ marginTop: 14 }}>
          <thead>
            <tr><th>Date</th><th>Cost for</th><th>Paid to</th><th className="num">Amount (PKR)</th><th></th></tr>
          </thead>
          <tbody>
            {(data?.costs ?? []).map((c: any) => (
              <tr key={c.id}>
                <td>{new Date(c.incurredAt).toLocaleDateString('en-GB')}</td>
                <td>
                  {c.label}
                  {c.note && <span className="due" style={{ color: '#6b7686', fontWeight: 400 }}>{c.note}</span>}
                </td>
                <td>{c.vendor ?? ''}</td>
                <td className="num">
                  {fmt(c.amount)}
                  {c.currency && (
                    <span className="due" style={{ color: '#6b7686', fontWeight: 400 }}>
                      {c.currency} {fmt(c.foreignAmount)} @ {Number(c.exRate)}
                    </span>
                  )}
                </td>
                <td>
                  <button type="button" className="small" style={{ background: '#fee2e2', color: '#991b1b' }} onClick={() => remove(c)} title="Delete cost">✕</button>
                </td>
              </tr>
            ))}
            {data && data.costs.length === 0 && (
              <tr><td colSpan={5} className="muted">No costs added yet. Add what you paid for this invoice to see your profit.</td></tr>
            )}
          </tbody>
        </table>

        <h3 style={{ marginTop: 18, fontSize: 15 }}>Add a cost</h3>
        <div className="row" style={{ marginBottom: 10 }}>
          <div style={{ flex: 2 }}>
            <label>Cost for</label>
            <input list="cost-labels" placeholder="e.g. Airline freight" value={label} onChange={(e) => setLabel(e.target.value)} />
            <datalist id="cost-labels">{SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div style={{ flex: 2 }}>
            <label>Paid to (optional)</label>
            <input placeholder="Vendor / company" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ marginBottom: 10 }}>
          <div>
            <label>Amount</label>
            <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </div>
          <div style={{ maxWidth: 110 }}>
            <label>Currency</label>
            <select value={currency} onChange={(e) => pickCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          {foreign && (
            <div>
              <label>PKR per 1 {currency}</label>
              <input type="number" min="0" step="any" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
          )}
          <div>
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ marginBottom: 6 }}>
          <div>
            <label>Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        {pkrPreview !== null && <p className="muted" style={{ margin: '4px 0' }}>= PKR {fmt(pkrPreview)}</p>}

        <div className="actions">
          <button type="button" className="ghost" onClick={onClose}>Close</button>
          <button type="button" disabled={busy} onClick={add}>{busy ? 'Adding...' : 'Add cost'}</button>
        </div>
      </div>
    </div>
  );
}
