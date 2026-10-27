import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { fmt } from '../components';

export default function ClearanceNew() {
  const nav = useNavigate();
  const [importable, setImportable] = useState<any[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [cName, setCName] = useState('');
  const [cAddress, setCAddress] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cTax, setCTax] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/clearance/importable-invoices').then(setImportable).catch((e) => setError(e.message));
  }, []);

  async function create(body: Record<string, string>) {
    setBusy(true);
    setError('');
    try {
      const j = await api('/clearance', { method: 'POST', body });
      nav(`/clearance/jobs/${j.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <h1>New clearance job</h1>
      {error && <div className="error">{error}</div>}
      <div className="grid2">
        <div className="card">
          <h3>Import a shipment invoice</h3>
          <p className="muted">
            Copies the customer, shipment details and freight charges. You then add your own services.
          </p>
          <label>Shipment invoice</label>
          <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
            <option value="">Select invoice…</option>
            {importable.map((i) => (
              <option key={i.id} value={i.id}>
                {i.invoiceNo} · {i.shipment.customer?.name} · {i.shipment.refNo} · {i.shipment.mode}{' '}
                {i.shipment.origin} → {i.shipment.destination}
                {i.shipment.blAwbNo ? ` · ${i.shipment.blAwbNo}` : ''} · PKR {fmt(i.total)}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 10 }}>
            <button disabled={busy || !invoiceId} onClick={() => create({ sourceInvoiceId: invoiceId })}>
              {busy ? 'Opening…' : 'Import & open'}
            </button>
          </div>
        </div>

        <div className="card">
          <h3>Job without import</h3>
          <label>Customer name</label>
          <input value={cName} onChange={(e) => setCName(e.target.value)} />
          <div className="row" style={{ marginTop: 8 }}>
            <div style={{ flex: 3 }}>
              <label>Address</label>
              <input value={cAddress} onChange={(e) => setCAddress(e.target.value)} />
            </div>
            <div>
              <label>Phone</label>
              <input value={cPhone} onChange={(e) => setCPhone(e.target.value)} />
            </div>
            <div>
              <label>NTN</label>
              <input value={cTax} onChange={(e) => setCTax(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <button
              disabled={busy || !cName.trim()}
              onClick={() =>
                create({
                  customerName: cName.trim(),
                  customerAddress: cAddress.trim(),
                  customerPhone: cPhone.trim(),
                  customerTax: cTax.trim(),
                })
              }
            >
              Create job
            </button>
          </div>
        </div>
      </div>
    </>
  );
}