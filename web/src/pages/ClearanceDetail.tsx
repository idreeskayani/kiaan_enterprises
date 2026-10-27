import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getUser, openClearancePdf } from '../api';
import { Badge, fmt } from '../components';
import { CLEARANCE_STATUSES, label } from '../constants';

type Charge = { label: string; amount: string };

const SUGGESTIONS = [
  'Agency / Clearing charges',
  'Examination charges',
  'Port / Terminal charges',
  'Demurrage',
  'Transport / Delivery',
  'Miscellaneous',
];

const DETAIL_FIELDS: [string, string, 'text' | 'date'][] = [
  ['origin', 'From', 'text'],
  ['destination', 'To', 'text'],
  ['blNo', 'Master no. (MAWB / MBL)', 'text'],
  ['hawbNo', 'House no. (HAWB / HBL)', 'text'],
  ['flight', 'Flight / vessel', 'text'],
  ['commodity', 'Commodity', 'text'],
  ['pcs', 'Packages', 'text'],
  ['weightKg', 'Gross weight (kg)', 'text'],
  ['igmNo', 'IGM no.', 'text'],
  ['igmDate', 'IGM date', 'date'],
  ['beDate', 'GD / B-E date', 'date'],
  ['custRef', 'Customer ref no.', 'text'],
];

export default function ClearanceDetail() {
  const { id } = useParams();
  const role = getUser()?.role;
  const canWork = role === 'ADMIN' || role === 'CLEARING_AGENT';
  const canPay = canWork || role === 'ACCOUNTANT';

  const [job, setJob] = useState<any>(null);
  const [hsCodes, setHsCodes] = useState<any[]>([]);

  // editable fields
  const [cName, setCName] = useState('');
  const [cAddress, setCAddress] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cTax, setCTax] = useState('');
  const [det, setDet] = useState<Record<string, string>>({});
  const [hsCodeId, setHsCodeId] = useState('');
  const [value, setValue] = useState('');
  const [gdNo, setGdNo] = useState('');
  const [includeFreight, setIncludeFreight] = useState(false);
  const [charges, setCharges] = useState<Charge[]>([]);

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
      setHsCodeId(j.hsCodeId ?? '');
      setValue(String(Number(j.assessableValue)));
      setGdNo(j.gdNo ?? '');
      setIncludeFreight(!!j.includeFreight);
      setCharges(
        (j.lines as any[])
          .filter((l) => l.kind === 'CHARGE')
          .map((l) => ({ label: l.label, amount: String(l.amount) })),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    api('/hs-codes').then(setHsCodes).catch(() => setHsCodes([]));
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
          hsCodeId: hsCodeId || null,
          assessableValue: Number(value) || 0,
          gdNo: gdNo.trim(),
          includeFreight,
          charges: charges
            .filter((c) => c.label.trim() && Number(c.amount) > 0)
            .map((c) => ({ label: c.label.trim(), amount: Number(c.amount) })),
        },
      }),
    );

  const pay = (next: 'PAID' | 'UNPAID' | 'PARTIAL') =>
    run(async () => {
      let dueAmount: number | undefined;
      if (next === 'PARTIAL') {
        const v = window.prompt(`Remaining dues (PKR). Invoice total is ${fmt(job.total)}`);
        if (!v) return;
        dueAmount = Math.round(Number(v) * 100) / 100;
        if (!(dueAmount > 0) || dueAmount >= Number(job.total)) {
          throw new Error('Remaining dues must be more than 0 and less than the invoice total');
        }
      }
      await api(`/clearance/${id}/payment`, { method: 'PATCH', body: { status: next, dueAmount } });
    });

  if (!job) return <>{error ? <div className="error">{error}</div> : <p>Loading...</p>}</>;

  const locked = !!job.invoiceNo;
  const edit = canWork && !locked;
  const setD = (k: string, v: string) => setDet({ ...det, [k]: v });
  const imported = (job.importedLines ?? []) as { label: string; amount: number }[];
  const importedTotal = imported.reduce((s, l) => s + Number(l.amount), 0);

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
        <h3>Customer</h3>
        <div className="row">
          <div style={{ flex: 2 }}>
            <label>Name</label>
            <input value={cName} disabled={!edit} onChange={(e) => setCName(e.target.value)} />
          </div>
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
      </div>

      <div className="card">
        <h3>Consignment</h3>
        {job.shipment && (
          <p className="muted">
            Imported from shipment{' '}
            {role === 'CLEARING_AGENT' ? job.shipment.refNo : <Link to={`/shipments/${job.shipment.id}`}>{job.shipment.refNo}</Link>}
            {job.sourceInvoice ? ` · invoice ${job.sourceInvoice.invoiceNo}` : ''}
          </p>
        )}
        <div className="row" style={{ marginBottom: 8 }}>
          <div>
            <label>Mode</label>
            <select value={det.mode ?? ''} disabled={!edit} onChange={(e) => setD('mode', e.target.value)}>
              <option value="">-</option>
              <option value="AIR">AIR</option>
              <option value="SEA">SEA</option>
              <option value="ROAD">ROAD</option>
            </select>
          </div>
          {DETAIL_FIELDS.slice(0, 3).map(([k, text, type]) => (
            <div key={k}>
              <label>{text}</label>
              <input type={type} value={det[k] ?? ''} disabled={!edit} onChange={(e) => setD(k, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="row">
          {DETAIL_FIELDS.slice(3).map(([k, text, type]) => (
            <div key={k}>
              <label>{text}</label>
              <input type={type} value={det[k] ?? ''} disabled={!edit} onChange={(e) => setD(k, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      {job.sourceInvoice && (
        <div className="card">
          <h3>Imported shipment invoice {job.sourceInvoice.invoiceNo}</h3>
          <table>
            <tbody>
              {imported.map((l, i) => (
                <tr key={i}><td>{l.label}</td><td className="num">{fmt(l.amount)}</td></tr>
              ))}
              <tr>
                <td><b>Freight invoice total</b></td>
                <td className="num"><b>PKR {fmt(importedTotal)}</b></td>
              </tr>
            </tbody>
          </table>
          <label style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={includeFreight}
              disabled={!edit}
              onChange={(e) => setIncludeFreight(e.target.checked)}
            />
            Also bill these freight charges on this invoice
          </label>
          <p className="muted">
            Leave it unticked when the freight is billed separately and you only need these figures as reference
            for the assessable value.
          </p>
        </div>
      )}

      <div className="card">
        <h3>Duties, taxes &amp; service charges</h3>
        <div className="row">
          <div style={{ flex: 2 }}>
            <label>HS code (calculates duty and taxes)</label>
            <select value={hsCodeId} disabled={!edit} onChange={(e) => setHsCodeId(e.target.value)}>
              <option value="">None (enter taxes as charges)</option>
              {hsCodes.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.code} · {h.description} (D {Number(h.dutyPct)}% / ST {Number(h.salesTaxPct)}% / WHT {Number(h.whtPct)}%)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Assessable value (PKR)</label>
            <input type="number" min="0" step="any" value={value} disabled={!edit}
              onChange={(e) => setValue(e.target.value)} />
          </div>
          <div>
            <label>GD No</label>
            <input value={gdNo} disabled={!edit} onChange={(e) => setGdNo(e.target.value)} />
          </div>
        </div>

        <h3 style={{ marginTop: 18 }}>Service charges (PKR)</h3>
        <datalist id="charge-names">
          {SUGGESTIONS.map((x) => <option key={x} value={x} />)}
        </datalist>
        {charges.map((c, i) => (
          <div className="row" key={i} style={{ marginBottom: 6 }}>
            <div style={{ flex: 3 }}>
              <input list="charge-names" placeholder="Charge name" value={c.label} disabled={!edit}
                onChange={(e) => setCharges(charges.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            </div>
            <div>
              <input type="number" min="0" step="any" placeholder="Amount" value={c.amount} disabled={!edit}
                onChange={(e) => setCharges(charges.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
            </div>
            {edit && (
              <button className="ghost small" style={{ flex: 'none' }}
                onClick={() => setCharges(charges.filter((_, j) => j !== i))}>Remove</button>
            )}
          </div>
        ))}
        {edit && (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="ghost" style={{ flex: 'none' }}
              onClick={() => setCharges([...charges, { label: '', amount: '' }])}>+ Add charge</button>
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
              <tr key={i}><td>{l.label}</td><td className="num">{fmt(l.amount)}</td></tr>
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
          {job.shipment && (
            <p className="muted" style={{ marginTop: 8 }}>
              GD Filed, Examination, Released and On Hold also update the shipment status on the freight side.
            </p>
          )}
        </div>
      )}

      <div className="card">
        <h3>Invoice</h3>
        {job.invoiceNo ? (
          <>
            <div className="row" style={{ marginBottom: 10 }}>
              <div><b>{job.invoiceNo}</b></div>
              <div>
                <Badge status={job.payment} />
                {job.payment === 'PARTIAL' && <span className="due">Due {fmt(job.dueAmount)}</span>}
              </div>
              <div><b>{fmt(job.total)}</b></div>
              <button className="ghost" style={{ flex: 'none' }}
                onClick={() => run(() => openClearancePdf(job.id))}>View PDF</button>
            </div>
            {canPay && (
              <div className="row" style={{ gap: 6 }}>
                <button className="small" style={{ flex: 'none' }} disabled={busy || job.payment === 'PAID'}
                  onClick={() => pay('PAID')}>Mark paid</button>
                <button className="ghost small" style={{ flex: 'none' }} disabled={busy}
                  onClick={() => pay('PARTIAL')}>Part payment</button>
                <button className="ghost small" style={{ flex: 'none' }} disabled={busy || job.payment === 'UNPAID'}
                  onClick={() => pay('UNPAID')}>Mark unpaid</button>
                {canWork && (
                  <button className="ghost small" style={{ flex: 'none' }} disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Delete invoice ${job.invoiceNo}? You can generate it again afterwards.`)) {
                        run(() => api(`/clearance/${id}/invoice`, { method: 'DELETE' }));
                      }
                    }}>Delete invoice</button>
                )}
              </div>
            )}
          </>
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