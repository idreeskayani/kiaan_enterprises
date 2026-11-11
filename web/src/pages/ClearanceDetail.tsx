import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, getUser, openClearancePdf } from '../api';
import { Badge, fmt } from '../components';
import { ShareButton } from '../Share';
import { CLEARANCE_STATUSES, label } from '../constants';
import { CHARGE_CODES, COLLECTORATES, DUTY_KEYS, NOC_TYPES, TRANSPORT_MODES, VIR_PREFIX, buildVir } from '../Charges';

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
  const [collectorate, setCollectorate] = useState('');
  const [otherColl, setOtherColl] = useState(false); // typing a collectorate that is not in the list
  const [mode, setMode] = useState('');
  const [virSerial, setVirSerial] = useState('');
  const [vir, setVir] = useState('');
  // duty head -> amount typed in (assessed items)
  const [duties, setDuties] = useState<Record<string, string>>({});
  // charge code -> amount typed in
  const [charges, setCharges] = useState<Record<string, string>>({});
  // paid through PSID: the duties are printed on the bill but not added to the total
  const [psid, setPsid] = useState(false);
  const [containers, setContainers] = useState<string[]>([]);
  const [containerIn, setContainerIn] = useState('');
  // NOC types taken, each with its own charge
  const [nocs, setNocs] = useState<{ type: string; amount: string }[]>([]);
  // bilty transport: origin, destination and the rent
  const [bilty, setBilty] = useState({ on: false, origin: '', destination: '', rent: '' });

  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
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
      setCollectorate(j.collectorate ?? '');
      setMode(j.modeOfTransport ?? '');
      setVir(j.virNumber ?? '');
      setVirSerial((j.virNumber ?? '').split('-')[1] ?? '');
      const dd: Record<string, string> = {};
      for (const [k, v] of Object.entries(j.duties ?? {})) dd[k] = String(v);
      setDuties(dd);
      const c: Record<string, string> = {};
      for (const l of j.lines as any[]) if (l.code) c[l.code] = String(l.amount);
      setCharges(c);
      setPsid(!!j.paidThroughPsid);
      setContainers(j.containers ?? []);
      setNocs(((j.nocs ?? []) as { type: string; amount: number }[]).map((n) => ({ type: n.type, amount: Number(n.amount) > 0 ? String(n.amount) : '' })));
      const b = j.biltyTransport;
      setBilty(
        b
          ? { on: true, origin: b.origin, destination: b.destination, rent: Number(b.rent) > 0 ? String(b.rent) : '' }
          : { on: false, origin: '', destination: '', rent: '' },
      );
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

  const dutyTotalNow = () => DUTY_KEYS.reduce((t, d) => t + (Number(duties[d.key]) || 0), 0);

  // saves what is typed on the page (used by Save, View, Save draft and Share)
  const patch = () => {
    if (bilty.on && (!bilty.origin.trim() || !bilty.destination.trim())) {
      return Promise.reject(new Error('Enter the origin and destination for Bilty Transport'));
    }
    return api(`/clearance/${id}`, {
        method: 'PATCH',
        body: {
          customerName: cName.trim(),
          customerAddress: cAddress,
          customerPhone: cPhone,
          customerTax: cTax,
          details: det,
          assessableValue: Number(value) || 0,
          gdNo: gdNo.trim(),
          collectorate: collectorate.trim(),
          modeOfTransport: mode,
          virNumber: vir.trim(),
          duties: Object.fromEntries(DUTY_KEYS.map((d) => [d.key, Number(duties[d.key]) || 0])),
          charges: CHARGE_CODES.map((c) => ({
            code: c.code,
            amount:
              c.code === '101' && dutyTotalNow() > 0 ? dutyTotalNow() : Number(charges[c.code]) || 0,
          })).filter((c) => c.amount > 0),
          paidThroughPsid: psid,
          containers,
          nocs: nocs.map((n) => ({ type: n.type, amount: Number(n.amount) || 0 })),
          biltyTransport: bilty.on
            ? { origin: bilty.origin.trim(), destination: bilty.destination.trim(), rent: Number(bilty.rent) || 0 }
            : null,
        },
      });
  };

  const save = () => run(patch);

  // pasted or typed container numbers (separated by space, comma or new line) are added to the list
  function addContainer() {
    const add = containerIn.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
    setContainers([...containers, ...add.filter((c, i) => !containers.includes(c) && add.indexOf(c) === i)]);
    setContainerIn('');
  }

  // View invoice: save the typed details first, then open the PDF (a preview until it is saved as a draft)
  function viewInvoice() {
    const win = window.open('', '_blank');
    run(async () => {
      try {
        await patch();
        await openClearancePdf(job.id, win);
      } catch (e) {
        win?.close();
        throw e;
      }
    });
  }

  function saveDraft() {
    run(async () => {
      await patch();
      await api(`/clearance/${id}/draft`, { method: 'POST' });
    });
  }

  // Share invoice: saves it as a draft and opens the share popup. Sharing issues it.
  function shareInvoice() {
    run(async () => {
      await patch();
      await api(`/clearance/${id}/draft`, { method: 'POST' });
      setShareOpen(true);
    });
  }

  if (!job) return <>{error ? <div className="error">{error}</div> : <p>Loading...</p>}</>;

  const isDraft = job.payment === 'DRAFT';
  // a draft or an unpaid invoice can be edited; a paid or part paid one is locked
  const locked = !!job.invoiceNo && !isDraft && job.payment !== 'UNPAID';
  const edit = canWork && !locked;
  const setD = (k: string, v: string) => {
    const next = { ...det, [k]: v };
    setDet(next);
    // the VIR date follows the G.D / B/E date
    if (k === 'beDate') {
      const b = buildVir(mode, virSerial, v);
      if (b) setVir(b);
    }
  };
  // VIR number follows the mode of transport (prefix), serial and G.D / B/E date
  const changeMode = (m: string) => {
    setMode(m);
    const b = buildVir(m, virSerial, det.beDate ?? '');
    if (b) setVir(b);
  };
  const changeSerial = (v: string) => {
    setVirSerial(v);
    const b = buildVir(mode, v, det.beDate ?? '');
    if (b) setVir(b);
  };
  const dutyTotal = DUTY_KEYS.reduce((s, d) => s + (Number(duties[d.key]) || 0), 0);
  const prefix = VIR_PREFIX[mode];

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, flex: 4 }}>
          {job.jobNo}
          {job.invoiceNo && <span className="muted" style={{ fontSize: 16, marginLeft: 12 }}>{job.invoiceNo}</span>}
        </h1>
        <Badge status={job.status} />
      </div>
      {error && <div className="error">{error}</div>}
      {locked && (
        <p className="muted">
          {job.payment === 'PAID'
            ? 'This invoice is paid, so it cannot be edited. Mark it unpaid on the Invoices page to edit it.'
            : 'A payment is recorded on this invoice, so it cannot be edited.'}
        </p>
      )}

      <div className="card">
        <h3>Tracking: collectorate, mode of transport &amp; VIR</h3>
        <div className="row" style={{ marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <label>Collectorate</label>
            <select
              value={otherColl || (collectorate !== '' && !COLLECTORATES.includes(collectorate)) ? '__other' : collectorate}
              disabled={!edit}
              onChange={(e) => {
                if (e.target.value === '__other') {
                  setOtherColl(true);
                  if (COLLECTORATES.includes(collectorate)) setCollectorate('');
                } else {
                  setOtherColl(false);
                  setCollectorate(e.target.value);
                }
              }}
            >
              <option value="">Select collectorate</option>
              {COLLECTORATES.map((c) => <option key={c} value={c}>{c}</option>)}
              <option value="__other">Other (type it)</option>
            </select>
            {(otherColl || (collectorate !== '' && !COLLECTORATES.includes(collectorate))) && (
              <input style={{ marginTop: 6 }} value={collectorate} disabled={!edit}
                placeholder="Type the collectorate name" onChange={(e) => setCollectorate(e.target.value)} />
            )}
          </div>
        </div>
        <div className="row">
          <div>
            <label>Mode of Transport</label>
            <select value={mode} disabled={!edit} onChange={(e) => changeMode(e.target.value)}>
              <option value="">Select</option>
              {TRANSPORT_MODES.map(([k, text]) => <option key={k} value={k}>{text}</option>)}
            </select>
          </div>
          <div>
            <label>VIR serial</label>
            <input value={virSerial} disabled={!edit} placeholder="0569" onChange={(e) => changeSerial(e.target.value)} />
          </div>
          <div style={{ flex: 2 }}>
            <label>VIR Number</label>
            <input value={vir} disabled={!edit} placeholder="IPAF-0569-11022024"
              onChange={(e) => setVir(e.target.value.toUpperCase())} />
          </div>
        </div>
        {edit && mode && !prefix && (
          <p className="muted">No VIR prefix is set for this mode yet. Type the VIR number by hand.</p>
        )}
        {edit && prefix && !det.beDate && (
          <p className="muted">Set the Dated (G.D / B/E) field above and the VIR number fills in automatically.</p>
        )}
      </div>

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
          <div style={{ flex: 2 }}>
            <label>Container No (add one or more)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={containerIn}
                disabled={!edit}
                placeholder="e.g. MSKU1234567"
                onChange={(e) => setContainerIn(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addContainer();
                  }
                }}
              />
              <button type="button" className="ghost" style={{ flex: 'none' }}
                disabled={!edit || !containerIn.trim()} onClick={addContainer}>Add</button>
            </div>
            {containers.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {containers.map((c) => (
                  <span key={c} style={{ background: '#e0e7ff', borderRadius: 12, padding: '2px 4px 2px 10px', fontSize: 13 }}>
                    {c}
                    {edit && (
                      <button type="button" aria-label={`Remove ${c}`} title="Remove"
                        style={{ background: 'none', color: '#475569', padding: '0 6px', border: 0, cursor: 'pointer' }}
                        onClick={() => setContainers(containers.filter((x) => x !== c))}>×</button>
                    )}
                  </span>
                ))}
              </div>
            )}
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
          {CHARGE_CODES.map((c) =>
            c.code === '101' ? (
              <div key={c.code} style={{ flex: '1 1 100%' }}>
                <label>{c.code} · {c.label}</label>
                <input type="number" min="0" step="any"
                  value={dutyTotal > 0 ? String(dutyTotal) : charges[c.code] ?? ''}
                  disabled={!edit || dutyTotal > 0}
                  onChange={(e) => setCharges({ ...charges, [c.code]: e.target.value })} />
                <div style={{ margin: '8px 0 4px 18px', paddingLeft: 12, borderLeft: '3px solid #cbd5e1' }}>
                  <label>Where this customs duty goes (PKR) - the total fills 101 automatically</label>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
                    {DUTY_KEYS.map((d) => (
                      <div key={d.key} style={{ flex: '1 1 140px' }}>
                        <label>{d.label}</label>
                        <input type="number" min="0" step="any" value={duties[d.key] ?? ''} disabled={!edit}
                          onChange={(e) => setDuties({ ...duties, [d.key]: e.target.value })} />
                      </div>
                    ))}
                  </div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    Total customs duty: <b>{fmt(dutyTotal)}</b>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: edit ? 'pointer' : 'default' }}>
                    <input type="checkbox" style={{ width: 'auto' }} checked={psid} disabled={!edit}
                      onChange={(e) => setPsid(e.target.checked)} />
                    <span>
                      <b>Paid through PSID</b>
                      <span className="muted"> - the client paid these duties himself. They are shown on the bill but not added to the total.</span>
                    </span>
                  </label>
                </div>
              </div>
            ) : (
              <div key={c.code} style={{ flex: '1 1 260px' }}>
                <label>{c.code} · {c.label}</label>
                <input type="number" min="0" step="any" value={charges[c.code] ?? ''} disabled={!edit}
                  onChange={(e) => setCharges({ ...charges, [c.code]: e.target.value })} />
              </div>
            ),
          )}

          <div style={{ flex: '1 1 100%' }}>
            <label>NOC (No Objection Certificate) - each one you add gets its own charge</label>
            <select
              value=""
              disabled={!edit}
              onChange={(e) => e.target.value && setNocs([...nocs, { type: e.target.value, amount: '' }])}
            >
              <option value="">Add a NOC...</option>
              {NOC_TYPES.filter((t) => !nocs.some((n) => n.type === t)).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {nocs.map((n) => (
              <div key={n.type} className="row" style={{ marginTop: 8, alignItems: 'flex-end', gap: 8, flexWrap: 'nowrap' }}>
                <div style={{ flex: 1 }}>
                  <label>NOC Charges - {n.type} (PKR)</label>
                  <input type="number" min="0" step="any" value={n.amount} disabled={!edit}
                    onChange={(e) => setNocs(nocs.map((x) => (x.type === n.type ? { ...x, amount: e.target.value } : x)))} />
                </div>
                {edit && (
                  <button type="button" className="ghost small" style={{ flex: 'none' }}
                    onClick={() => setNocs(nocs.filter((x) => x.type !== n.type))}>Remove</button>
                )}
              </div>
            ))}
          </div>

          <div style={{ flex: '1 1 100%' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: edit ? 'pointer' : 'default' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={bilty.on} disabled={!edit}
                onChange={(e) => setBilty({ ...bilty, on: e.target.checked })} />
              <b>Bilty Transport</b>
            </label>
            {bilty.on && (
              <div className="row" style={{ marginTop: 8, gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <label>Origin</label>
                  <input value={bilty.origin} disabled={!edit} placeholder="e.g. Karachi"
                    onChange={(e) => setBilty({ ...bilty, origin: e.target.value })} />
                </div>
                <div style={{ flex: '1 1 180px' }}>
                  <label>Destination</label>
                  <input value={bilty.destination} disabled={!edit} placeholder="e.g. Islamabad"
                    onChange={(e) => setBilty({ ...bilty, destination: e.target.value })} />
                </div>
                <div style={{ flex: '1 1 160px' }}>
                  <label>Rent (PKR)</label>
                  <input type="number" min="0" step="any" value={bilty.rent} disabled={!edit}
                    onChange={(e) => setBilty({ ...bilty, rent: e.target.value })} />
                </div>
              </div>
            )}
          </div>
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
              <tr key={i} className={job.paidThroughPsid && l.code === '101' ? 'muted' : undefined}>
                <td>{l.code ? `${l.code} · ` : ''}{l.label}{job.paidThroughPsid && l.code === '101' ? ' (paid through PSID - not in total)' : ''}</td>
                <td className="num">{fmt(l.amount)}</td>
              </tr>
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
            {isDraft && <div><Badge status="DRAFT" /></div>}
            <button className="ghost" style={{ flex: 'none' }}
              onClick={() => run(() => openClearancePdf(job.id))}>View</button>
            <ShareButton className="ghost" path={`/clearance/${job.id}/pdf`} invoiceNo={job.invoiceNo}
              company="TNI Enterprises" customer={job.customerName} total={job.total}
              onShared={() => isDraft && api(`/clearance/${id}/issue`, { method: 'POST' }).then(load)} />
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
          <div className="row" style={{ gap: 10 }}>
            <button className="ghost" style={{ flex: 'none' }} disabled={busy} onClick={viewInvoice}>
              View invoice
            </button>
            <button className="ghost" style={{ flex: 'none' }} disabled={busy} onClick={saveDraft}>
              Save draft
            </button>
            <button style={{ flex: 'none' }} disabled={busy} onClick={shareInvoice}>
              Share invoice
            </button>
          </div>
        ) : (
          <p className="muted">No invoice yet.</p>
        )}
      </div>

      {shareOpen && job.invoiceNo && (
        <ShareButton hideButton defaultOpen path={`/clearance/${job.id}/pdf`} invoiceNo={job.invoiceNo}
          company="TNI Enterprises" customer={job.customerName} total={job.total}
          onShared={() => api(`/clearance/${id}/issue`, { method: 'POST' }).then(load)}
          onClose={() => { setShareOpen(false); load(); }} />
      )}

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