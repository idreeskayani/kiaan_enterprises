import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, getUser, openQuotationPdf } from '../api';
import { Badge, Breakdown, fmt } from '../components';
import { PencilIcon } from '../Icons';

// Read-only view of one quotation.
export default function QuotationDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [q, setQ] = useState<any>(null);
  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/quotations/${id}`).then(setQ).catch((e) => setError(e.message));
    api(`/quotations/${id}/quote`).then(setQuote).catch(() => setQuote(null));
  }, [id]);

  if (!q) return error ? <div className="error">{error}</div> : <p className="muted">Loading...</p>;

  const p = q.payload ?? {};
  const canEdit = getUser()?.role === 'OPERATOR' && (q.status === 'DRAFT' || q.status === 'SENT');
  const route = [p.origin, ...(p.viaPoints ?? []), p.destination].join(' → ');
  const view = () => {
    const win = window.open('', '_blank');
    openQuotationPdf(q.id, win).catch((e) => setError(e.message));
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, flex: 3 }}>
          {q.quoteNo} <Badge status={q.status} />
        </h1>
        <button className="ghost" onClick={() => nav('/quotations')}>Back</button>
        <button className="ghost" onClick={view}>View PDF</button>
        {canEdit && (
          <button onClick={() => nav(`/quotations/${q.id}/edit`)}>
            <PencilIcon size={14} /> Edit
          </button>
        )}
      </div>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <div className="grid2">
          <div>
            <p><b>Customer:</b> {q.customer?.name}</p>
            {q.customer?.phone && <p><b>Phone:</b> {q.customer.phone}</p>}
            {q.customer?.address && <p><b>Address:</b> {q.customer.address}</p>}
            <p><b>Mode:</b> {p.mode}</p>
            <p><b>Route:</b> {route}</p>
          </div>
          <div>
            <p><b>Total:</b> PKR {fmt(q.total)}</p>
            <p><b>Created:</b> {new Date(q.createdAt).toLocaleDateString()}</p>
            <p><b>Valid until:</b> {new Date(q.validUntil).toLocaleDateString()}</p>
            <p><b>Master no:</b> {p.blAwbNo ?? '-'}</p>
            <p><b>House no:</b> {p.hawbNo ?? '-'}</p>
            <p><b>Flight / vessel:</b> {p.flight ?? '-'}</p>
            <p><b>ETA:</b> {p.eta ? new Date(p.eta).toLocaleDateString() : '-'}</p>
            <p><b>Goods value:</b> {fmt(p.goodsValue ?? 0)}</p>
            {q.shipment && (
              <p><b>Shipment:</b> <Link to={`/shipments/${q.shipment.id}`}>{q.shipment.refNo}</Link></p>
            )}
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
            {(p.items ?? []).map((i: any, idx: number) => (
              <tr key={idx}>
                <td>{Number(i.lengthCm)} × {Number(i.widthCm)} × {Number(i.heightCm)}</td>
                <td className="num">{Number(i.weightKg)}</td>
                <td className="num">{i.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {quote && <Breakdown q={quote} />}
    </>
  );
}