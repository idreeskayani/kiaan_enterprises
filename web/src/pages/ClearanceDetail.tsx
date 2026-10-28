import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, getUser, openPdf } from '../api';
import { Badge, Breakdown, fmt } from '../components';
import { ShareButton } from '../Share';
import { STATUSES, label } from '../constants';

export default function ShipmentDetail() {
  const { id } = useParams();
  const [s, setS] = useState<any>(null);
  const [quote, setQuote] = useState<any>(null);
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await api(`/shipments/${id}`);
      setS(data);
      setStatus(data.status);
      api(`/shipments/${id}/quote`).then(setQuote).catch(() => setQuote(null));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
const isAgent = getUser()?.role === 'CLEARING_AGENT';
  if (!s) return <>{error ? <div className="error">{error}</div> : <p>Loading...</p>}</>;

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, flex: 4 }}>{s.refNo}</h1>
        <Badge status={s.status} />
      </div>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <div className="grid2">
          <div>
            <p><b>Customer:</b> {s.customer.name}</p>
            <p><b>Mode:</b> {s.mode}</p>
            <p><b>Route:</b> {[s.origin, ...(s.viaPoints ?? []), s.destination].join(' → ')}</p>
          </div>
          <div>
            <p><b>Master no:</b> {s.blAwbNo ?? '-'}</p>
            <p><b>House no:</b> {s.hawbNo ?? '-'}</p>
            <p><b>Flight / vessel:</b> {s.flight ?? '-'}</p>
            {s.exRate && <p><b>Ex. rate:</b> {Number(s.exRate)} ({s.currency})</p>}
            <p><b>ETA:</b> {s.eta ? new Date(s.eta).toLocaleDateString() : '-'}</p>
            <p><b>Goods value:</b> {fmt(s.goodsValue)}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Packages</h3>
        <table>
          <thead>
            <tr><th>Dimensions (cm)</th><th className="num">Weight (kg)</th><th className="num">Qty</th></tr>
          </thead>
          <tbody>
            {s.items.map((i: any) => (
              <tr key={i.id}>
                <td>{Number(i.lengthCm)} × {Number(i.widthCm)} × {Number(i.heightCm)}</td>
                <td className="num">{Number(i.weightKg)}</td>
                <td className="num">{i.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {quote && <Breakdown q={quote} />}
{!isAgent && (
      <div className="card">
        <h3>Update status</h3>
        <div className="row">
          <div>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((x) => (
                <option key={x} value={x}>{label(x)}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 3 }}>
            <label>Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button
            disabled={busy || status === s.status}
            onClick={() =>
              run(async () => {
                await api(`/shipments/${id}/status`, {
                  method: 'PATCH',
                  body: { status, note: note || undefined },
                });
                setNote('');
              })
            }
          >
            Update
          </button>
        </div>
      </div>
)}

      <div className="card">
        <h3>Invoice</h3>
        {s.invoice ? (
          <div className="row">
            <div><b>{s.invoice.invoiceNo}</b></div>
            <div><Badge status={s.invoice.status === 'PAID' ? 'PAID' : 'UNPAID'} /></div>
            <div><b>{fmt(s.invoice.total)}</b></div>
            <button className="ghost" onClick={() => run(() => openPdf(s.invoice.id))}>View PDF</button>
            <ShareButton path={`/invoices/${s.invoice.id}/pdf`} invoiceNo={s.invoice.invoiceNo}
              company="Kiaan Freight Services" customer={s.customer?.name} total={s.invoice.total} />
          </div>
        ) : (
          <div className="row" style={{ gap: 10 }}>
            <button
              disabled={busy || s.status !== 'DELIVERED'}
              onClick={() => run(() => api(`/invoices/shipment/${id}`, { method: 'POST' }))}
            >
              Generate invoice
            </button>
            {s.status !== 'DELIVERED' && (
              <span className="muted">Available once the shipment is marked Delivered.</span>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Status history</h3>
        <ul className="timeline">
          {s.history.map((h: any) => (
            <li key={h.id}>
              <Badge status={h.status} />{' '}
              <span className="muted">
                {new Date(h.at).toLocaleString()} · {h.user?.email}
              </span>
              {h.note && <div>{h.note}</div>}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}