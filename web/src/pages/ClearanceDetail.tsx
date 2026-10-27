import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, getUser, openClearancePdf } from '../api';
import { Badge, fmt } from '../components';
import { CLEARANCE_STATUSES, label } from '../constants';
import { CHARGE_CODES } from '../Charges';

const DETAIL_FIELDS: [string, string, 'text' | 'date'][] = [
  ['expressOn', 'Express On', 'text'],
  ['commodity', 'Commodity', 'text'],
  ['pcs', 'No. of Pkgs', 'text'],
  ['weightKg', 'Weight (KG)', 'text'],
  ['invoiceRef', 'Invoice No', 'text'],
  ['partyCode', 'Party Code', 'text'],
  ['blNo', 'AWB No', 'text'],
  ['hawbNo', 'HAWB No', 'text'],
  ['igmNo', 'IGM No', 'text'],
  ['beNo', 'B/E S/B No', 'text'],
  ['beDate', 'Dated (G.D / B/E)', 'date'],
  ['demBillNo', 'Dem.Bill No', 'text'],
  ['wNo', 'W/ No', 'text'],
];

export default function ClearanceDetail() {
  const { id } = useParams();
  const role = getUser()?.role;
  const canWork = role === 'CLEARING_AGENT';

  const [job, setJob] = useState<any>(null);

  // editable fields
  const [cName, setCName] = useState('');
  const [cAddress, setCAddress] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cTax, setCTax] = useState('');
  const [det, setDet] = useState<Record<string, string>>({});
  const [value, setValue] = useState('');
  const [gdNo, setGdNo] = useState('');
  // charge code -> amount typed in
  const [charges, setCharges] = useState<Record<string, string>>({});

  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const j = await api(`/clearance/${id}`);
      setJob(j);
      setStatus(j.status);
      setCName(j.customerName);
      setCAddress(j.customerAddress ?? '');
      setCPhone(j.customerPhone ?? '');
      setCTax(j.customerTax ?? '');
      setDet(j.details ?? {});
      setValue(String(Number(j.assessableValue)));
      setGdNo(j.gdNo ?? '');
      const c: Record<string, string> = {};
      for (const l of j.lines as any[]) if (l.code) c[l.code] = String(l.amount);
      setCharges(c);
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

  const save = () =>
    run(() =>
      api(`/clearance/${id}`, {
        method: 'PATCH',
        body: {
          customerName: cName.trim(),
          customerAddress: cAddress,
          customerPhone: cPhone,
          customerTax: cTax,
          details: det,
          assessableValue: Number(value) || 0,
          gdNo: gdNo.trim(),
          charges: CHARGE_CODES.filter((c) => Number(charges[c.code]) > 0).map((c) => ({
            code: c.code,
            amount: Number(charges[c.code]),
          })),
        },
      }),
    );

  if (!job) return <>{error ? <div className="error">{error}</div> : <p>Loading...</p>}</>;

  const locked = !!job.invoiceNo;
  const edit = canWork && !locked;
  const setD = (k: string, v: string) => setDet({ ...det, [k]: v });
  
  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, flex: 4 }}>{job.jobNo}</h1>
        <Badge status={job.status} />
      </div>
      {error && <div className="error">{error}</div>}
      {locked && (
        <p className="muted">An invoice has been generated. Delete the invoice below to edit the details and charges.</p>
      )}

      <div className="card">
        <h3>Bill details</h3>
        <div className="row" style={{ marginBottom: 8 }}>
          <div style={{ flex: 2 }}>
            <label>Mr./M/s.</label>
            <input value={cName} disabled={!edit} onChange={(e) => setCName(e.target.value)} />
          </div>
          <div>
            <label>G.D No</label>
            <input value={gdNo} disabled={!edit} onChange={(e) => setGdNo(e.target.value)} />
          </div>
          <div>
            <label>Value Rs</label>
            <input type="number" min="0" step="any" value={value} disabled={!edit}
              onChange={(e) => setValue(e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ marginBottom: 8 }}>
          <div style={{ flex: 3 }}>
            <label>Address</label>
            <input value={cAddress} disabled={!edit} onChange={(e) => setCAddress(e.target.value)} />
          </div>
          <div>
            <label>Phone</label>
            <input value={cPhone} disabled={!edit} onChange={(e) => setCPhone(e.target.value)} />
          </div>
          <div>
            <label>NTN</label>
            <input value={cTax} disabled={!edit} onChange={(e) => setCTax(e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {DETAIL_FIELDS.map(([k, text, type]) => (
            <div key={k}>
              <label>{text}</label>
              <input type={type} value={det[k] ?? ''} disabled={!edit} onChange={(e) => setD(k, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Charges (PKR) - fill only the ones you need</h3>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          {CHARGE_CODES.map((c) => (
            <div key={c.code} style={{ flex: '1 1 260px' }}>
              <label>{c.code} · {c.label}</label>
              <input type="number" min="0" step="any" value={charges[c.code] ?? ''} disabled={!edit}
                onChange={(e) => setCharges({ ...charges, [c.code]: e.target.value })} />
            </div>
          ))}
        </div>
        {edit && (
          <div className="row" style={{ marginTop: 12 }}>
            <button disabled={busy} style={{ flex: 'none' }} onClick={save}>Save &amp; recalculate</button>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Invoice charges</h3>
        <table>
          <thead>
            <tr><th>Particulars</th><th className="num">Amount (PKR)</th></tr>
          </thead>
          <tbody>
            {(job.lines as any[]).map((l, i) => (
              <tr key={i}><td>{l.code ? `${l.code} · ` : ''}{l.label}</td><td className="num">{fmt(l.amount)}</td></tr>
            ))}
            {job.lines.length === 0 && (
              <tr><td colSpan={2} className="muted">No charges yet. Save the details above to calculate.</td></tr>
            )}
            <tr>
              <td><b>TOTAL</b></td>
              <td className="num"><b>PKR {fmt(job.total)}</b></td>
            </tr>
          </tbody>
        </table>
      </div>

      {canWork && (
        <div className="card">
          <h3>Update stage</h3>
          <div className="row">
            <div>
              <label>Stage</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {CLEARANCE_STATUSES.map((x) => <option key={x} value={x}>{label(x)}</option>)}
              </select>
            </div>
            <div style={{ flex: 3 }}>
              <label>Note (optional)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <button
              disabled={busy || status === job.status}
              onClick={() =>
                run(async () => {
                  await api(`/clearance/${id}/status`, {
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
        {job.invoiceNo ? (
          <div className="row">
            <div><b>{job.invoiceNo}</b></div>
            <div><b>{fmt(job.total)}</b></div>
            <button className="ghost" style={{ flex: 'none' }}
              onClick={() => run(() => openClearancePdf(job.id))}>View</button>
            {canWork && (
              <button className="ghost" style={{ flex: 'none' }} disabled={busy}
                onClick={() => {
                  if (window.confirm(`Delete invoice ${job.invoiceNo}? You can generate it again afterwards.`)) {
                    run(() => api(`/clearance/${id}/invoice`, { method: 'DELETE' }));
                  }
                }}>Delete invoice</button>
            )}
          </div>
        ) : canWork ? (
          <button disabled={busy} onClick={() => run(() => api(`/clearance/${id}/invoice`, { method: 'POST' }))}>
            Generate invoice
          </button>
        ) : (
          <p className="muted">No invoice yet.</p>
        )}
      </div>

      <div className="card">
        <h3>Clearance history</h3>
        <ul className="timeline">
          {job.history.map((h: any) => (
            <li key={h.id}>
              <Badge status={h.status} />{' '}
              <span className="muted">{new Date(h.at).toLocaleString()} · {h.user?.email}</span>
              {h.note && <div>{h.note}</div>}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}