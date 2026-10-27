import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function ClearanceNew() {
  const nav = useNavigate();
  const [cName, setCName] = useState('');
  const [cAddress, setCAddress] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cTax, setCTax] = useState('');
  const [prev, setPrev] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // previous customers (newest first, one entry per name)
  useEffect(() => {
    api('/clearance')
      .then((rows: any[]) => {
        const seen = new Set<string>();
        const list: any[] = [];
        for (const r of rows) {
          const k = String(r.customerName).trim().toLowerCase();
          if (!k || seen.has(k)) continue;
          seen.add(k);
          list.push(r);
        }
        setPrev(list);
      })
      .catch(() => setPrev([]));
  }, []);

  // typing or picking a previous customer fills the address, phone and NTN
  function pickName(v: string) {
    setCName(v);
    const hit = prev.find((c) => String(c.customerName).trim().toLowerCase() === v.trim().toLowerCase());
    if (hit) {
      setCAddress(hit.customerAddress ?? '');
      setCPhone(hit.customerPhone ?? '');
      setCTax(hit.customerTax ?? '');
    }
  }

  async function create() {
    setBusy(true);
    setError('');
    try {
      const j = await api('/clearance', {
        method: 'POST',
        body: {
          customerName: cName.trim(),
          customerAddress: cAddress.trim(),
          customerPhone: cPhone.trim(),
          customerTax: cTax.trim(),
        },
      });
      nav(`/clearance/jobs/${j.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <h1>New invoice</h1>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <label>Customer name (Mr./M/s.)</label>
        <input list="prev-customers" placeholder="Enter Customer Name" value={cName}
          onChange={(e) => pickName(e.target.value)} />
        <datalist id="prev-customers">
          {prev.map((c) => <option key={c.id} value={c.customerName} />)}
        </datalist>
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
          <button disabled={busy || !cName.trim()} onClick={create}>
            {busy ? 'Creating…' : 'Create invoice'}
          </button>
        </div>
      </div>
    </>
  );
}