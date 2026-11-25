import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Badge, fmt } from '../components';

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  quotations: number;
  shipments: number;
  invoices: number;
  invoiced: number;
  outstanding: number;
};
type Form = { name: string; phone: string; address: string; taxNumber: string };
const EMPTY: Form = { name: '', phone: '', address: '', taxNumber: '' };
const norm = (n: string) => n.replace(/\s+/g, ' ').trim().toLowerCase();
const day = (d: string) => new Date(d).toLocaleDateString('en-GB');

export default function Customers() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState('');
  const [details, setDetails] = useState<any>(null);
  const [editing, setEditing] = useState<string | null>(null); // customer id, or 'new'
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setRows(await api('/customers/summary'));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(c: Customer) {
    if (openId === c.id) return setOpenId('');
    setOpenId(c.id);
    setDetails(null);
    try {
      setDetails(await api(`/customers/${c.id}/details`));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startEdit(c: Customer | null) {
    setError('');
    setEditing(c ? c.id : 'new');
    setForm(
      c ? { name: c.name, phone: c.phone ?? '', address: c.address ?? '', taxNumber: c.taxNumber ?? '' } : EMPTY,
    );
  }

  async function save() {
    setError('');
    if (!form.name.trim()) return setError('Enter the customer name');
    setBusy(true);
    try {
      const isNew = editing === 'new';
      await api(isNew ? '/customers' : `/customers/${editing}`, {
        method: isNew ? 'POST' : 'PATCH',
        body: isNew
          ? {
              name: form.name.trim(),
              phone: form.phone.trim() || undefined,
              address: form.address.trim() || undefined,
              taxNumber: form.taxNumber.trim() || undefined,
            }
          : {
              name: form.name.trim(),
              phone: form.phone.trim(),
              address: form.address.trim(),
              taxNumber: form.taxNumber.trim(),
            },
      });
      setEditing(null);
      await load();
      if (openId && !isNew) setDetails(await api(`/customers/${openId}/details`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Customer) {
    if (!window.confirm(`Delete the customer "${c.name}"? This cannot be undone.`)) return;
    setError('');
    try {
      await api(`/customers/${c.id}`, { method: 'DELETE' });
      if (openId === c.id) setOpenId('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const needle = norm(q);
  const shown = rows.filter((c) => !needle || norm(`${c.name} ${c.phone ?? ''} ${c.taxNumber ?? ''}`).includes(needle));
  const nameCount = new Map<string, number>();
  rows.forEach((c) => nameCount.set(norm(c.name), (nameCount.get(norm(c.name)) ?? 0) + 1));
  const set = (k: keyof Form, v: string) => setForm({ ...form, [k]: v });

  return (
    <>
      <div className="row" style={{ marginBottom: 14, alignItems: 'center' }}>
        <h1 style={{ margin: 0, flex: 3 }}>Customers</h1>
        <div style={{ flex: 2 }}>
          <input type="search" placeholder="Search name, phone or NTN" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button type="button" onClick={() => startEdit(null)}>+ Add customer</button>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Address</th>
              <th>NTN</th>
              <th className="num">Quotations</th>
              <th className="num">Shipments</th>
              <th className="num">Invoices</th>
              <th className="num">Outstanding</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => {
              const used = c.quotations + c.shipments + c.invoices > 0;
              const dup = (nameCount.get(norm(c.name)) ?? 0) > 1;
              return (
                <Fragment key={c.id}>
                  <tr>
                    <td>
                      <a href="#" onClick={(e) => { e.preventDefault(); toggle(c); }}>
                        <b>{c.name}</b>
                      </a>
                      {dup && <span className="due" style={{ color: '#991b1b' }}>Duplicate name{used ? '' : ' · no records, safe to delete'}</span>}
                    </td>
                    <td>{c.phone ?? ''}</td>
                    <td>{c.address ?? ''}</td>
                    <td>{c.taxNumber ?? ''}</td>
                    <td className="num">{c.quotations}</td>
                    <td className="num">{c.shipments}</td>
                    <td className="num">{c.invoices}</td>
                    <td className="num">{fmt(c.outstanding)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="small ghost" style={{ marginRight: 6 }} onClick={() => toggle(c)}>
                        {openId === c.id ? 'Hide' : 'Details'}
                      </button>
                      <button type="button" className="small ghost" style={{ marginRight: 6 }} onClick={() => startEdit(c)}>Edit</button>
                      <button
                        type="button"
                        className="small"
                        style={{ background: '#fee2e2', color: '#991b1b', opacity: used ? 0.4 : 1 }}
                        disabled={used}
                        title={used ? 'Has quotations, shipments or invoices, so it cannot be deleted' : 'Delete customer'}
                        onClick={() => remove(c)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  {openId === c.id && (
                    <tr>
                      <td colSpan={9} style={{ background: '#f8fafc' }}>
                        {!details ? (
                          <span className="muted">Loading...</span>
                        ) : (
                          <div className="row" style={{ alignItems: 'flex-start', gap: 18 }}>
                            <div style={{ flex: 1, minWidth: 260 }}>
                              <h4 style={{ margin: '4px 0' }}>Quotations ({details.quotations.length})</h4>
                              <table>
                                <tbody>
                                  {details.quotations.map((x: any) => (
                                    <tr key={x.id}>
                                      <td><Link to={`/quotations/${x.id}`}>{x.quoteNo}</Link></td>
                                      <td>{day(x.createdAt)}</td>
                                      <td className="num">{fmt(x.total)}</td>
                                      <td><Badge status={x.status} /></td>
                                    </tr>
                                  ))}
                                  {details.quotations.length === 0 && <tr><td className="muted">None</td></tr>}
                                </tbody>
                              </table>
                            </div>
                            <div style={{ flex: 1, minWidth: 260 }}>
                              <h4 style={{ margin: '4px 0' }}>Shipments ({details.shipments.length})</h4>
                              <table>
                                <tbody>
                                  {details.shipments.map((x: any) => (
                                    <tr key={x.id}>
                                      <td><Link to={`/shipments/${x.id}`}>{x.refNo}</Link></td>
                                      <td>{day(x.createdAt)}</td>
                                      <td>{x.origin} → {x.destination}</td>
                                      <td><Badge status={x.status} /></td>
                                    </tr>
                                  ))}
                                  {details.shipments.length === 0 && <tr><td className="muted">None</td></tr>}
                                </tbody>
                              </table>
                            </div>
                            <div style={{ flex: 1, minWidth: 260 }}>
                              <h4 style={{ margin: '4px 0' }}>Invoices ({details.invoices.length})</h4>
                              <table>
                                <tbody>
                                  {details.invoices.map((x: any) => (
                                    <tr key={x.id}>
                                      <td>{x.invoiceNo}</td>
                                      <td>{day(x.issuedAt)}</td>
                                      <td className="num">{fmt(x.total)}</td>
                                      <td><Badge status={x.status} /></td>
                                    </tr>
                                  ))}
                                  {details.invoices.length === 0 && <tr><td className="muted">None</td></tr>}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {shown.length === 0 && (
              <tr><td colSpan={9} className="muted">{rows.length ? 'No customer matches your search.' : 'No customers yet.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={() => !busy && setEditing(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h3>{editing === 'new' ? 'Add customer' : 'Edit customer'}</h3>
            {error && <div className="error">{error}</div>}
            <div style={{ marginBottom: 10 }}><label>Name</label><input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
            <div style={{ marginBottom: 10 }}><label>Phone</label><input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
            <div style={{ marginBottom: 10 }}><label>Address</label><input value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
            <div style={{ marginBottom: 10 }}><label>NTN / Tax number</label><input value={form.taxNumber} onChange={(e) => set('taxNumber', e.target.value)} /></div>
            <div className="actions">
              <button type="button" className="ghost" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}